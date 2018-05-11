var now = new Date();

var app = new Vue({
    el: '#app',
    data: {
        startYear: (now.getMonth() < 10 ? now.getFullYear() - 1 : now.getFullYear()),
        leaveAllowance: 29,
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
            return Math.floor((this.endDate.getTime() - new Date().getTime()) / (7 * 24 * 60 * 60 * 1000));
        },
        weekdaysLeft: function () {
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
    }
});

// Calendar IDs
var EVENTS = '0677eej491em8t3r85h0i12s8g@group.calendar.google.com';
var AVAILABILITY = 'nrd1gh8ffgsgf259tjcam5h3qs@group.calendar.google.com';
var CASELESS_TAGS = ['holiday', 'annual', 'hols', '(al)'];
var TAGS = ['AL', 'A/L'];
var HALFDAY_TAGS = ['AM','(AM)','PM','(PM)','pm','morning','afternoon'];

// Client ID and API key from the Developer Console
var CLIENT_ID = '1054709840369-u807mdk8v4maro8q6r2nremo4tajjdmf.apps.googleusercontent.com';
var API_KEY = 'AIzaSyD5EAF9pYHkuCfMwH7TEB3qK7icef5dEjM';

// Array of API discovery doc URLs for APIs used by the quickstart
var DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
var SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

var authorizeButton = document.getElementById('authorize-button');
var signoutButton = document.getElementById('signout-button');
var modal = document.getElementById('modal');

/**
 *  On load, called to load the auth2 library and API client library.
 */
function handleClientLoad() {
    gapi.load('client:auth2', initClient);
}

/**
 *  Initializes the API client library and sets up sign-in state
 *  listeners.
 */
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
        authorizeButton.onclick = handleAuthClick;
        signoutButton.onclick = handleSignoutClick;
    });
}

/**
 *  Called when the signed in status changes, to update the UI
 *  appropriately. After a sign-in, the API is called.
 */
function updateSigninStatus(isSignedIn) {
    app.signedIn = isSignedIn;
    if (isSignedIn) {
        signoutButton.style.display = '';
        app.userName = userName();
        app.userEmail = userEmail();
        getClosureDays();
    } else {
        signoutButton.style.display = 'none';
        app.status = '';
        app.userName = '';
        app.userEmail = '';
        app.holidays = [];
    }
}

/**
 *  Sign in the user upon button click.
 */
function handleAuthClick(event) {
    app.status = 'Authenticating...';
    gapi.auth2.getAuthInstance().signIn();
}

/**
 *  Sign out the user upon button click.
 */
function handleSignoutClick(event) {
    gapi.auth2.getAuthInstance().signOut();
}

function userEmail() {
    return gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile().getEmail();
}

function userName() {
    return gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile().getGivenName();
}

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

        getLeaveDays();
    });
}

function getLeaveDays() {
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

                if (event.creator.email === userEmail() || name === userName()) {
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
        modal.classList.add('in');
    });
}

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

function holidaysUsed(event) {
    var dates = expandDays(event.start.date, event.end.date);
    var count = countWorkingDays(dates);

    if (HALFDAY_TAGS.some(function (t) { return event.summary.endsWith(t) }) ||
        event.summary.toLowerCase().includes('half day')) {
        count -= 0.5;
    }

    return count;
}

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

