// Calendar IDs
var EVENTS = '0677eej491em8t3r85h0i12s8g@group.calendar.google.com';
var AVAILABILITY = 'nrd1gh8ffgsgf259tjcam5h3qs@group.calendar.google.com';
// Keywords
var CASELESS_TAGS = ['holiday', 'annual', 'hols', '(al)'];
var TAGS = ['AL', 'A/L'];
var HALFDAY_TAGS = ['AM','(AM)','PM','(PM)','pm','morning','afternoon'];
// Google API stuff
var CLIENT_ID = '1054709840369-u807mdk8v4maro8q6r2nremo4tajjdmf.apps.googleusercontent.com';
var API_KEY = 'AIzaSyD5EAF9pYHkuCfMwH7TEB3qK7icef5dEjM';
var DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
var SCOPES = "https://www.googleapis.com/auth/calendar.readonly";
//
var paramRegex = /\?extra=([0-9]+)/;
var paramMatches = paramRegex.exec(window.location.href);
var extraDays = 0;
if (paramMatches && paramMatches[1]) {
    extraDays = parseInt(paramMatches[1]);
}

var now = new Date();

var app = new Vue({
    el: '#app',
    data: {
        startYear: (now.getMonth() < 9 ? now.getFullYear() - 1 : now.getFullYear()), // Month 9 is October (0 indexed)
        baseLeaveAllowance: 29,
        extraDays: extraDays,
        holidays: [],
        closureDays: [],
        userName: '',
        userEmail: '',
        status: 'Loading...',
        signedIn: false
    },
    computed: {
        ready: function () {
            return this.status === null;
        },
        startDate: function () {
            return new Date('' + this.startYear + '-10-01');
        },
        endDate: function () {
            return new Date('' + (this.startYear + 1) + '-09-30');
        },
        leaveAllowance: function () {
            return this.baseLeaveAllowance + this.extraDays;
        },
        leaveTaken: function () {
            return this.holidays.reduce(function (acc, event) { return acc + holidaysUsed(event) }, 0);
        },
        leaveRemaining: function () {
            return this.leaveAllowance - this.leaveTaken;
        },
        leavePercent: function () {
            return Math.ceil(100 * (this.leaveRemaining / this.leaveAllowance))
        },
        weeksLeft: function () {
            return Math.ceil((this.endDate.getTime() - new Date().getTime()) / (7 * 24 * 60 * 60 * 1000));
        },
        weekdaysLeft: function () {
            // Get today's date at midnight
            var today = new Date('' + now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate());
            return expandDays(today, this.endDate).filter(function (d) { return d.getDay() !== 0 && d.getDay() !== 6});
        },
        workingDaysLeft: function () {
            var count = 0;

            var self = this;
            this.weekdaysLeft.forEach(function (day) {
                if (!self.closureDays.some(function (d) { return d.getTime() === day.getTime(); })) {
                    count += 1;
                }
            });

            return count;
        },
        progressBarColour: function () {
            if (this.leavePercent < 25) {
                return 'progress-bar-danger';
            } else if (this.leavePercent < 50) {
                return 'progress-bar-warning';
            } else {
                return 'progress-bar-success';
            }
        }
    },
    methods: {
        signIn: function () {
            app.status = 'Authenticating...';
            gapi.auth2.getAuthInstance().signIn();
        },
        signOut: function () {
            gapi.auth2.getAuthInstance().signOut();
        }
    }
});

// Callback for API client script load.
function handleClientLoad() {
    gapi.load('client:auth2', initClient);
}

// Initializes the API client library and sets up sign-in state listeners.
function initClient() {
    gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES
    }).then(function () {
        // Listen for sign-in state changes.
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);

        // Handle the initial sign-in state.
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
    });
}

// Callback for user sign in/out.
function updateSigninStatus(isSignedIn) {
    app.signedIn = isSignedIn;
    if (isSignedIn) {
        var profile = gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile();
        app.userName = profile.getGivenName();
        app.userEmail = profile.getEmail();
        getClosureDays();
    } else {
        app.status = null;
        app.userName = '';
        app.userEmail = '';
        app.holidays = [];
    }
}

// Get university closure days
function getClosureDays() {
    app.status = 'Fetching closure days...';
    gapi.client.calendar.events.list({
        'calendarId': EVENTS,
        'timeMin': app.startDate.toISOString(),
        'timeMax': app.endDate.toISOString(),
        'showDeleted': false,
        'singleEvents': true,
        'maxResults': 1000,
        'orderBy': 'startTime'
    }).then(function(response) {
        app.closureDays = [];

        response.result.items.forEach(function (event) {
            if (event.summary.match(/university closed/i)) {
                var days = expandDays(event.start.date, event.end.date);
                days.forEach(function (day) {
                    if (day.getDay() !== 0 && day.getDay() !== 6) {
                        app.closureDays.push(day);
                    }
                });
            }
        });

        getLeaveEvents();
    });
}

// Get user's annual leave events
function getLeaveEvents() {
    app.status = 'Fetching leave...';
    gapi.client.calendar.events.list({
        'calendarId': AVAILABILITY,
        'timeMin': app.startDate.toISOString(),
        'timeMax': app.endDate.toISOString(),
        'showDeleted': false,
        'singleEvents': true,
        'maxResults': 1000,
        'orderBy': 'startTime'
    }).then(function(response) {
        app.holidays = response.result.items.filter(function (event) {
            var parts = event.summary.match(/([a-zA-Z]+) (.+)/);
            if (parts) {
                var name = parts[1];
                var sum = parts[2];

                if (event.creator.email === app.userEmail || name === app.userName) {
                    if (sum) {
                        return !(sum.includes('lieu') || sum.toLowerCase().includes('toil')) &&
                            (CASELESS_TAGS.some(function (t) { return sum.toLowerCase().includes(t); }) ||
                                TAGS.some(function (t) { return sum.includes(t); }))
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            } else {
                return false;
            }
        });

        app.status = null;
    });
}

/**
 * Returns an array of Dates for each day occurring between the two given dates (inclusive).
 * @param {Date} start - The start date of the range.
 * @param {Date} end - The end date of the range.
 * @return {Array.<Date>} - The array of days.
 */
function expandDays(start, end) {
    var endTime = new Date(end).getTime();
    var date = new Date(start);
    var dates = [];

    while(date.getTime() < endTime) {
        dates.push(date);
        date = new Date(date.getTime());
        date.setDate(date.getDate() + 1);
    }

    return dates;
}

/**
 * Returns the number of days of annual leave used by a given calendar event.
 * @param {Event} event - The Google Calendar API Event.
 * @return {number} - The number of days of annual leave used.
 */
function holidaysUsed(event) {
    var dates = expandDays(event.start.date, event.end.date);
    var count = countWorkingDays(dates);

    if (HALFDAY_TAGS.some(function (t) { return event.summary.endsWith(t) }) ||
        event.summary.toLowerCase().includes('half day')) {
        count -= 0.5;
    }

    return count;
}

/**
 * Returns the number of working days present in an array of dates.
 * @param {Array.<Date>} dates - An array of dates being counted.
 * @return {number} - The number of working days.
 */
function countWorkingDays(dates) {
    var count = 0;
    var closureDays = app ? app.closureDays : [];

    for (var i = 0; i < dates.length; i++) {
        if (dates[i].getDay() !== 0 && dates[i].getDay() !== 6) {
            if (!closureDays.some(function (d) { return d.getTime() === dates[i].getTime(); })) {
                count += 1;
            }
        }
    }

    return count;
}

