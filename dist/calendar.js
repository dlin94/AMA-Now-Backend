'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getSchedule = exports.getEvents = undefined;

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _eventModel = require('./models/event-model');

var _eventModel2 = _interopRequireDefault(_eventModel);

var _jobModel = require('./models/job-model');

var _jobModel2 = _interopRequireDefault(_jobModel);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var CALENDAR_ID = process.env.CALENDAR_ID || 'amaverify@gmail.com';
var API_KEY = process.env.API_KEY || 'AIzaSyA2yG721085RrJDXnQwTAu6j0dcMU6EvTQ';

// https://calendar.google.com/calendar/embed?src=amaverify@gmail.com
// https://developers.google.com/google-apps/calendar/v3/reference/events/list

// TODO: Should be scheduled for once a day; may need to store in DB, and events should be removed accordingly on update
// DB should be updated once a day. Just drop the DB and repopulate it with data
// from calendar API call.
// Might need to deal with timezone offsets... Read events reference and this: http://stackoverflow.com/questions/10830357/javascript-toisostring-ignores-timezone-offset
var getEvents = exports.getEvents = function getEvents() {
  // TODO: temporary parameter...probably not needed
  _eventModel2.default.collection.drop();
  var timeMin = new Date().toISOString();
  (0, _request2.default)('https://www.googleapis.com/calendar/v3/calendars/' + CALENDAR_ID + '/events?key=' + API_KEY + '&timeMin=' + timeMin, {
    method: 'GET'
  }, function (err, response, body) {
    if (err) {
      console.log("Error: " + err);
    } else {
      //console.log(body);
      var events = JSON.parse(body).items;
      //console.log(events);
      //console.log(events);
      //console.log(events.length);
      //console.log(response.statusCode);
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        var _loop = function _loop() {
          var e = _step.value;

          var subjects = getSubjects(e.summary);
          _eventModel2.default.find({ 'people': subjects }).exec(function (err, ev) {
            if (err) {
              console.log(err);
            } else {
              if (ev.length == 0) {
                console.log('Adding ' + subjects + ' to DB!');
                var event = new _eventModel2.default();
                event.date = e.start.dateTime;
                event.people = subjects;
                event.save() // TODO: only save if not already in database
                .then(function (result) {
                  //console.log("Result: " + result);
                }).catch(function (err) {
                  //console.log("Error: d" + err);
                });
              }
            }
          });
        };

        for (var _iterator = events[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          _loop();
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }
  });
};

var getSchedule = exports.getSchedule = function getSchedule(req, res) {
  _eventModel2.default.find().select('people date -_id').exec(function (err, ev) {
    if (err) {
      console.log(err);
      res.send(err);
    } else {
      res.json(ev);
    }
  });
};

var getSubjects = function getSubjects(summary) {
  var subjects = null;
  //let summArray = null;
  if (summary.startsWith("[")) {
    // remove brackets
    var n = summary.indexOf("]");
    summary = summary.slice(1, n);
  }

  if (summary.includes(",")) {
    subjects = summary.split(", ");
    var last = subjects.length - 1;
    if (subjects[last].includes("and ")) {
      subjects[last] = subjects[last].replace("and ", "");
    } else if (subjects[last].includes("& ")) {
      subjects[last] = subjects[last].replace("& ", "");
    }
  } else if (summary.includes("and")) {
    subjects = summary.split(" and ");
  } else {
    subjects = summary.split(" & ");
  }
  return subjects;
};

//const convertToUTC = (dateString) => {
//  return dateString.slice(0, -6) + 'Z';
//}