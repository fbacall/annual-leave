require 'yaml'
require 'google/apis/calendar_v3'
require 'googleauth'
require 'googleauth/stores/file_token_store'

require 'fileutils'

OOB_URI = 'urn:ietf:wg:oauth:2.0:oob'
APPLICATION_NAME = 'Google Calendar API Ruby Quickstart'
CLIENT_SECRETS_PATH = 'client_secret.json'
CREDENTIALS_PATH = File.join(Dir.home, '.credentials',
                             "calendar-ruby-quickstart.yaml")
SCOPE = Google::Apis::CalendarV3::AUTH_CALENDAR_READONLY

##
# Ensure valid credentials, either by restoring from the saved credentials
# files or intitiating an OAuth2 authorization. If authorization is required,
# the user's default browser will be launched to approve the request.
#
# @return [Google::Auth::UserRefreshCredentials] OAuth2 credentials
def authorize
  FileUtils.mkdir_p(File.dirname(CREDENTIALS_PATH))

  client_id = Google::Auth::ClientId.from_file(CLIENT_SECRETS_PATH)
  token_store = Google::Auth::Stores::FileTokenStore.new(file: CREDENTIALS_PATH)
  authorizer = Google::Auth::UserAuthorizer.new(
    client_id, SCOPE, token_store)
  user_id = 'default'
  credentials = authorizer.get_credentials(user_id)
  if credentials.nil?
    url = authorizer.get_authorization_url(
      base_url: OOB_URI)
    puts "Open the following URL in the browser and enter the " +
         "resulting code after authorization"
    puts url
    puts
    code = gets
    credentials = authorizer.get_and_store_credentials_from_code(
      user_id: user_id, code: code, base_url: OOB_URI)
  end
  credentials
end

def expand_days(event)
  start_date = Date.parse(event.start.date)
  end_date = Date.parse(event.end.date)

  dates = []
  date = start_date

  while date < end_date
    dates << date
    date += 1
  end

  dates
end

def holidays_used(event, closure_days)
  dates = expand_days(event)

  count = dates.count { |d| !(d.saturday? || d.sunday? || closure_days.include?(d)) }
  if ['AM','(AM)','PM','(PM)','pm'].any? { |t| event.summary.end_with?(t) } || event.summary.downcase.include?('half day')
    count -= 0.5
  end

  count
end

# Load config
config = YAML.load(File.read('config.yml'))

# Initialize the API
service = Google::Apis::CalendarV3::CalendarService.new
service.client_options.application_name = APPLICATION_NAME
service.authorization = authorize

start_year = Time.now.month < 10 ? (Time.now.year - 1) : (Time.now.year)
start_date = Time.parse("#{start_year}-10-01")
end_date = Time.parse("#{start_year + 1}-09-30")

# Get all the Uni closure days
events_resp = service.list_events(config['closure_calendar_id'],
                               max_results: 1000,
                               single_events: true,
                               order_by: 'startTime',
                               time_min: start_date.iso8601,
                               time_max: end_date.iso8601
)
closure_days = []
events_resp.items.select { |i| i.summary.downcase.strip == 'university closed' }.each do |i|
  closure_days += expand_days(i).reject { |d| d.saturday? || d.sunday? }
end

puts "Closure days (#{closure_days.count})"
closure_days.each { |d| puts "\t#{d}" }
puts

response = service.list_events(config['leave_calendar_id'],
                               max_results: 1000,
                               single_events: true,
                               order_by: 'startTime',
                               time_min: start_date.iso8601,
                               time_max: end_date.iso8601
)

all_day_events = response.items.select { |i| i.start.date } # Only include "all-day" events
items = all_day_events.select do |i|
  reason = i.summary.split(' ',2).last

  !(reason.include?('lieu') || reason.downcase.include?('toil')) && (
    config['tags'].any? { |t| reason.start_with?(t) } ||
    config['caseless_tags'].any? { |t| reason.downcase.start_with?(t) }
  )
end

group = items.group_by { |i| i.creator.display_name }

group.each do |person, events|
  leave_count = 0
  list = ''
  events.each do |event|
    days = holidays_used(event, closure_days)
    list << "\t#{event.start.date}: #{event.summary} (#{days} #{days == 1 ? 'day' : 'days'})\n"
    leave_count += days
  end
  puts "#{person} (#{leave_count}/#{config['max_days']})"
  puts list
  puts
end
