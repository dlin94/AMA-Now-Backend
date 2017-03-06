'use strict';

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _cors = require('cors');

var _cors2 = _interopRequireDefault(_cors);

var _nodeSchedule = require('node-schedule');

var _nodeSchedule2 = _interopRequireDefault(_nodeSchedule);

var _redditAccess = require('./reddit-access');

var _calendar = require('./calendar');

var _jobModel = require('./models/job-model');

var _jobModel2 = _interopRequireDefault(_jobModel);

var _mongoose = require('mongoose');

var _mongoose2 = _interopRequireDefault(_mongoose);

var _router = require('./router');

var _router2 = _interopRequireDefault(_router);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var app = (0, _express2.default)();
var mongoURI = process.env.MONGODB_URI || 'mongodb://localhost/ama';
_mongoose2.default.Promise = require('bluebird');
var conn = _mongoose2.default.connect(mongoURI);

app.use((0, _cors2.default)());
app.use(_bodyParser2.default.urlencoded({ extended: true }));
app.use(_bodyParser2.default.json());
app.use(_express2.default.static('public'));

app.use('/api', _router2.default);

app.get('/', function (req, res) {
  res.render('index');
});

var port = process.env.PORT || 6500;
app.listen(port, function () {
  var date = new Date();
  var cron = date.getSeconds() + ' ' + date.getMinutes() + ' * * * *';
  _nodeSchedule2.default.scheduleJob(cron, _calendar.getEvents);

  // Re-schedule lost AMA jobs
  _jobModel2.default.find().exec(function (err, jobs) {
    if (err) {
      console.log(err);
    } else if (jobs.length == 0) {
      console.log("No scheduled jobs in database.");
    } else {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        var _loop = function _loop() {
          var job = _step.value;

          console.log("Rescheduling job with refresh token: " + job.refresh);
          _nodeSchedule2.default.scheduleJob(job.date, function () {
            (0, _redditAccess.refreshToken)(job.refresh, job.date, job.ama, job.question);
          });
        };

        for (var _iterator = jobs[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
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
});

console.log('listening on: ' + port);