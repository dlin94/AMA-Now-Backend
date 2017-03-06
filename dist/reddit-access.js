'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.refreshToken = exports.retrieveToken = undefined;

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _nodeSchedule = require('node-schedule');

var _nodeSchedule2 = _interopRequireDefault(_nodeSchedule);

var _eventModel = require('./models/event-model');

var _eventModel2 = _interopRequireDefault(_eventModel);

var _jobModel = require('./models/job-model');

var _jobModel2 = _interopRequireDefault(_jobModel);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//  https://www.reddit.com/api/v1/authorize?client_id=kPpo2pzRIdkrMw&response_type=code&state=randomstring&redirect_uri=http://127.0.0.1:6500/authorize_callback&duration=permanent&scope=submit identity
var CLIENT_ID = process.env.APP_CLIENT_ID;
var CLIENT_SECRET = process.env.APP_CLIENT_SECRET;
var REDIRECT_URI = process.env.REDIRECT_URI || 'http://127.0.0.1:8080/submit'; //'http://amanow.surge.sh/submit';
var BOT_USER = process.env.BOT_USER;
var BOT_PASS = process.env.BOT_PASS;
var HOUR_MS = 3600000;

// http://stackoverflow.com/questions/16094545/cron-job-every-5-minutes-starting-from-a-specific-time
// http://stackoverflow.com/questions/30055595/starting-a-cron-job-at-30-minutes-in-unix?rq=1

// Then test if this works after 1 hr time (to see if refresh tokens are needed)
// Make sure it's not an AMA request
// Check live status maybe?

// TODO:
// 2. OPTIONAL FOR NOW: Implement feature: Private message to user when question is posted w/ link to the posted
//    or indicating that it has failed. Can be from self or from a bot account; however, seems
//    PMs may not show up as unread if sent to self.
// 3. Create a basic frontend that allows user to authorize the app and enter name
//    of AMA of interest and question to posts. TEST REDIRECTION W/ REACT-ROUTER FIRST.
// 4. Figure out how to use this data AFTER authorization is done to schedule a job.
//    May need to store authorization_codes and access/refresh tokens.
// 5. Use Google Calendar API to get AMA scheduleJob
// 6. Check if server can handle multiple jobs
// 7. The application should check if the time of request precedes the AMA start time.
//    If not, then it should inform the user with: "This AMA has already started!"
//    Or better yet, don't give the user the option to select it
// 8. When deploying to Heroku, make sure to set the proper timezone: http://stackoverflow.com/questions/33995194/what-timezone-is-heroku-server-using
// 9. To accommodate for potential naming conflicts, the app should not comment
//    AMA request threads and should try to get the thread that matches the ama start time most closely
// 10. Handle time conversions IF NECESSARY. Calendar dates are given in UTC.
// optional: set a time offset option (e.g., post in the thread after 5 minutes instead of immediately)
// optional: have a table showing all the upcoming AMAs
// TODO: Look at this for setup/structure: https://github.com/rajaraodv/react-redux-blog

// TODO: Refactor code to use axios for promise-based calls. Use a separate file. See the second answer here for
// reason why promises may be superior to nested callbacks: https://www.quora.com/Whats-the-difference-between-a-promise-and-a-callback-in-Javascript

// TODO: deploying to heroku:
// https://hashnode.com/post/deploying-mern-to-heroku-success-cio7sc1py013nis531rg3lfmz
// May want to consider separating front/backend servers

// Retrieves token and does something
var retrieveToken = exports.retrieveToken = function retrieveToken(req, res) {
  console.log(req.body.code);
  console.log(req.body.ama);
  console.log(req.body.question);

  _eventModel2.default.findOne({ people: req.body.ama.split(", ") }).exec(function (err, ev) {
    // ev is null if not found
    console.log('Event: ' + ev);
    // Schedule access token retrieval
    var currentTime = Date.now();

    // TODO (optional): Rate-limiting - Check for the Jobs collection to see if the ama has
    // already been requested. Grab the ama with the most recent date and set the amaTime equal
    // to two seconds more than the job.date
    var amaTime = new Date(new Date(ev.date).getTime() - HOUR_MS / 4); // Start checking 15 mins before scheduled time
    //const amaTime = new Date(Date.now() + HOUR_MS/60*2);
    //const amaTime = new Date(2017, 2, 3, 22, 0, 0, 0);
    console.log("Retrieving access token");
    (0, _request2.default)('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      form: {
        grant_type: 'authorization_code',
        code: req.body.code, //req.query.code,
        redirect_uri: REDIRECT_URI
      },
      auth: {
        username: CLIENT_ID,
        password: CLIENT_SECRET // TODO: make this env variable
      }
    }, function (err, response, body) {
      var refresh = JSON.parse(body).refresh_token;
      if (amaTime - currentTime > HOUR_MS) {
        // if AMA is much later, schedule a token refresh
        console.log(body);
        console.log("Scheduling to refresh token.");
        _nodeSchedule2.default.scheduleJob(amaTime, function () {
          // TODO: Check if scheduling refresh at amaTime is correct
          refreshToken(refresh, amaTime, req.body.ama, req.body.question);
        });
      } else {
        // AMA is within the hour, so schedule to check
        console.log("Scheduling to check posts...");
        console.log(body);
        getPost(err, response, body, amaTime, req.body.ama, req.body.question, refresh);
      }
      var job = new _jobModel2.default();
      job.date = amaTime;
      job.refresh = refresh;
      job.ama = req.body.ama;
      job.question = req.body.question;
      job.save();

      sendConfirmationToUser(body, req.body.ama, req.body.question);
    });
  });
  res.json({ message: 'Scheduled' });
};

// Sends a confirmation to the user
var sendConfirmationToUser = function sendConfirmationToUser(body, ama, question) {
  var token = JSON.parse(body).access_token;
  console.log(token);
  (0, _request2.default)('https://oauth.reddit.com/api/v1/me.json', {
    method: 'GET',
    headers: {
      'Authorization': 'bearer ' + token,
      'User-Agent': 'ama-q-app-v by /u/amaschedtester'
    }
  }, function (err, response, body) {
    if (!err && response.statusCode === 200) {
      var user = JSON.parse(body).name;
      pmUser(user, ama, question);
    }
  });
};

// Helper to PM the user for confirmation
var pmUser = function pmUser(user, ama, question) {
  (0, _request2.default)('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    form: {
      grant_type: 'password',
      username: BOT_USER, // TODO: env variables!
      password: BOT_PASS
    },
    headers: {
      'User-Agent': 'confirm-bot-v1 by /u/amanowbot'
    },
    auth: {
      username: 'YsjdDc7STaSedw',
      password: 'JmXLNk3lLXteq3c0_Qof3OainhY'
    }
  }, function (err, response, body) {
    if (!err && response.statusCode === 200) {
      console.log(body);
      var _token = JSON.parse(body).access_token;
      (0, _request2.default)('https://oauth.reddit.com/api/compose', {
        method: 'POST',
        headers: {
          'Authorization': 'bearer ' + _token,
          'User-Agent': 'confirm-bot-v1 by /u/amanowbot'
        },
        form: {
          'api_type': 'json',
          'subject': 'Your AMA Now question has been scheduled!',
          'text': 'Your question for ' + ama + ' has been scheduled. Your question:\n\n' + question,
          'to': user
        }
      }, function (err, response, body) {
        console.log('Confirmation status: ' + body);
      });
    }
  });
};

// Refreshes the access token
var refreshToken = exports.refreshToken = function refreshToken(refresh, amaTime, ama, question) {
  console.log("Refreshing token...");
  var currentTime = Date.now();
  //const refresh = JSON.parse(body).refresh_token;
  console.log("refresh = " + refresh);
  (0, _request2.default)('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh
    },
    auth: {
      username: CLIENT_ID,
      password: CLIENT_SECRET
    }
  }, function (err, response, body) {
    // TODO: check if need to refresh again in case server restart
    getPost(err, response, body, amaTime, ama, question, refresh);
  });
};

// Gets a target post to comment on
var getPost = function getPost(err, response, body, amaTime, ama, question, refresh) {
  if (!err && response.statusCode === 200) {
    var startMin = amaTime.getMinutes();
    var startHour = amaTime.getHours();
    var _token2 = JSON.parse(body).access_token;
    var cron1 = startMin + '-59/1 ' + startHour + ' * * *';
    var cron2 = '0-' + (startMin - 1) + '/1 ' + (startHour + 1) + ' * * *'; // be sure to cancel if post found in cron1
    var _found = false;
    //let cron = `${startMin}-${startMin + 59}/1 ${startHour} * * *`; // TODO: temp...make it an hour and accommodate for non-0 minute times (i.e., use two crons). Also start five minutes before to accoutn for early threads

    // TODO (NOT SURE IF POSSIBLE GIVEN THE WAY I'VE SET THIS UP): refactor into a single function passing in the cron, token, question, ama, refresh
    var job1 = _nodeSchedule2.default.scheduleJob(cron1, function () {
      (0, _request2.default)('https://oauth.reddit.com/r/IAmA/new.json', { // TODO: change back to test subreddit for more testing
        method: 'GET',
        headers: {
          'Authorization': 'bearer' + _token2, // for some reason, this endpoint doesn't require a space after 'bearer'
          'User-Agent': 'ama-q-app-v by /u/amaschedtester'
        }
      }, function (err, response, body) {
        if (err) {
          console.log("Get post err: " + err);
        } else {
          var posts = JSON.parse(body).data.children;
          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = posts[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              var post = _step.value;
              // http://stackoverflow.com/questions/3010840/loop-through-an-array-in-javascript
              var _iteratorNormalCompletion2 = true;
              var _didIteratorError2 = false;
              var _iteratorError2 = undefined;

              try {
                for (var _iterator2 = ama.split(", ")[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                  var person = _step2.value;

                  if (post.data.title.toUpperCase().includes(person.toUpperCase()) || post.data.selftext.toUpperCase().includes(person.toUpperCase())) {
                    console.log("Found post!");
                    commentOnPost(_token2, post, question, refresh);
                    _found = true;
                    job1.cancel();
                    break;
                  }
                  if (_found) break;
                }
              } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion2 && _iterator2.return) {
                    _iterator2.return();
                  }
                } finally {
                  if (_didIteratorError2) {
                    throw _iteratorError2;
                  }
                }
              }
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

          if (!_found) {
            console.log("Could not find post.");
          }
        }
      });
    });

    // Don't schedule cron2 if cron1 encompasses the entire hour
    if (startMin !== 0) {
      var _job = _nodeSchedule2.default.scheduleJob(cron2, function () {
        (0, _request2.default)('https://oauth.reddit.com/r/IAmA/new.json', { // TODO: change back to test subreddit for more testing
          method: 'GET',
          headers: {
            'Authorization': 'bearer' + _token2, // for some reason, this endpoint doesn't require a space after 'bearer'
            'User-Agent': 'ama-q-app-v by /u/amaschedtester'
          }
        }, function (err, response, body) {
          if (err) {
            console.log("Get post err: " + err);
          } else {
            if (_found) {
              // cancel this job if post was already found from job 1
              _job.cancel();
            } else {
              var posts = JSON.parse(body).data.children;
              var _iteratorNormalCompletion3 = true;
              var _didIteratorError3 = false;
              var _iteratorError3 = undefined;

              try {
                for (var _iterator3 = posts[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                  var post = _step3.value;
                  // http://stackoverflow.com/questions/3010840/loop-through-an-array-in-javascript
                  var _iteratorNormalCompletion4 = true;
                  var _didIteratorError4 = false;
                  var _iteratorError4 = undefined;

                  try {
                    for (var _iterator4 = ama.split(", ")[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                      var person = _step4.value;

                      if (post.data.title.toUpperCase().includes(person.toUpperCase()) || post.data.selftext.toUpperCase().includes(person.toUpperCase())) {
                        console.log("Found post!");
                        commentOnPost(_token2, post, question, refresh);
                        _found = true;
                        _job.cancel();
                        break;
                      }
                      if (_found) break;
                    }
                  } catch (err) {
                    _didIteratorError4 = true;
                    _iteratorError4 = err;
                  } finally {
                    try {
                      if (!_iteratorNormalCompletion4 && _iterator4.return) {
                        _iterator4.return();
                      }
                    } finally {
                      if (_didIteratorError4) {
                        throw _iteratorError4;
                      }
                    }
                  }
                }
              } catch (err) {
                _didIteratorError3 = true;
                _iteratorError3 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion3 && _iterator3.return) {
                    _iterator3.return();
                  }
                } finally {
                  if (_didIteratorError3) {
                    throw _iteratorError3;
                  }
                }
              }
            }
            if (!_found) {
              console.log("Could not find post.");
            }
          }
        });
      });
    }
  }
};

var checkForPost = function checkForPost() {
  (0, _request2.default)('https://oauth.reddit.com/r/IAmA/new.json', { // TODO: change back to test subreddit for more testing
    method: 'GET',
    headers: {
      'Authorization': 'bearer' + token, // for some reason, this endpoint doesn't require a space after 'bearer'
      'User-Agent': 'ama-q-app-v by /u/amaschedtester'
    }
  }, function (err, response, body) {
    if (err) {
      console.log("Get post err: " + err);
    } else {
      //let found = false;
      var posts = JSON.parse(body).data.children;
      var _iteratorNormalCompletion5 = true;
      var _didIteratorError5 = false;
      var _iteratorError5 = undefined;

      try {
        for (var _iterator5 = posts[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
          var post = _step5.value;
          // http://stackoverflow.com/questions/3010840/loop-through-an-array-in-javascript
          var _iteratorNormalCompletion6 = true;
          var _didIteratorError6 = false;
          var _iteratorError6 = undefined;

          try {
            for (var _iterator6 = ama.split(", ")[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
              var person = _step6.value;

              if (post.data.title.toUpperCase().includes(person.toUpperCase()) || post.data.selftext.toUpperCase().includes(person.toUpperCase())) {
                console.log("Found post!");
                commentOnPost(token, post, question, refresh);
                found = true;
                job2.cancel();
                break;
              }
              if (found) break;
            }
          } catch (err) {
            _didIteratorError6 = true;
            _iteratorError6 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion6 && _iterator6.return) {
                _iterator6.return();
              }
            } finally {
              if (_didIteratorError6) {
                throw _iteratorError6;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError5 = true;
        _iteratorError5 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion5 && _iterator5.return) {
            _iterator5.return();
          }
        } finally {
          if (_didIteratorError5) {
            throw _iteratorError5;
          }
        }
      }

      if (!found) {
        console.log("Could not find post.");
      }
    }
  });
};

// Helper to comment on target post
var commentOnPost = function commentOnPost(token, post, text, refresh) {
  (0, _request2.default)('https://oauth.reddit.com/api/comment.json', {
    method: 'POST',
    headers: {
      'Authorization': 'bearer ' + token,
      'User-Agent': 'ama-q-app-v by /u/amaschedtester'
    },
    form: {
      'api_type': 'json',
      'thing_id': post.kind + '_' + post.data.id,
      'text': text
    }
  }, function (err, response, body) {
    if (err) {
      console.log("Comment err: " + err);
    } else {
      console.log('Body: ' + body);
      console.log(response.statusCode);
    }

    // Done with Job, so remove from DB
    _jobModel2.default.findOne({ 'refresh': refresh }).remove().exec();
  });
};

// Helper to replace % by fixing negative value mod issue: http://stackoverflow.com/questions/4467539/javascript-modulo-not-behaving
var mod = function mod(n, m) {
  return (n % m + m) % m;
};