import request from 'request';
import Schedule from 'node-schedule';
import Event from './models/event-model';
import Job from './models/job-model';

//  https://www.reddit.com/api/v1/authorize?client_id=kPpo2pzRIdkrMw&response_type=code&state=randomstring&redirect_uri=http://127.0.0.1:6500/authorize_callback&duration=permanent&scope=submit identity
const CLIENT_ID = process.env.APP_CLIENT_ID;
const CLIENT_SECRET = process.env.APP_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://127.0.0.1:8080/submit'; //'http://amanow.surge.sh/submit';
const BOT_USER = process.env.BOT_USER;
const BOT_PASS = process.env.BOT_PASS;
const HOUR_MS = 3600000;


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
export const retrieveToken = (req, res) => {
  console.log(req.body.code);
  console.log(req.body.ama);
  console.log(req.body.question);

  Event.findOne({people: req.body.ama.split(", ")}).exec((err, ev) => { // ev is null if not found
    console.log(`Event: ${ev}`);
    // Schedule access token retrieval
    const currentTime = Date.now();

    // TODO (optional): Rate-limiting - Check for the Jobs collection to see if the ama has
    // already been requested. Grab the ama with the most recent date and set the amaTime equal
    // to two seconds more than the job.date
    const amaTime = new Date(new Date(ev.date).getTime() - HOUR_MS/4); // Start checking 15 mins before scheduled time
    //const amaTime = new Date(Date.now() + HOUR_MS/60*2);
    //const amaTime = new Date(2017, 2, 3, 22, 0, 0, 0);
    console.log("Retrieving access token");
    request('https://www.reddit.com/api/v1/access_token', {
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
    }, (err, response, body) => {
      const refresh = JSON.parse(body).refresh_token;
      if (amaTime - currentTime > (HOUR_MS)) { // if AMA is much later, schedule a token refresh
        console.log(body);
        console.log("Scheduling to refresh token.");
        Schedule.scheduleJob(amaTime, () => { // TODO: Check if scheduling refresh at amaTime is correct
          refreshToken(refresh, amaTime, req.body.ama, req.body.question);
        });
      }
      else { // AMA is within the hour, so schedule to check
        console.log("Scheduling to check posts...");
        console.log(body);
        getPost(err, response, body, amaTime, req.body.ama, req.body.question, refresh);
      }
      const job = new Job();
      job.date = amaTime;
      job.refresh = refresh;
      job.ama = req.body.ama;
      job.question = req.body.question;
      job.save();

      sendConfirmationToUser(body, req.body.ama, req.body.question);
    });
  });
  res.json({message: 'Scheduled'});
}

// Sends a confirmation to the user
const sendConfirmationToUser = (body, ama, question) => {
  const token = JSON.parse(body).access_token;
  console.log(token);
  request('https://oauth.reddit.com/api/v1/me.json', {
    method: 'GET',
    headers: {
      'Authorization': 'bearer ' + token,
      'User-Agent': 'ama-q-app-v by /u/amaschedtester'
    },
  }, (err, response, body) => {
    if (!err && response.statusCode === 200) {
      const user = JSON.parse(body).name;
      pmUser(user, ama, question);
    }
  });
}

// Helper to PM the user for confirmation
const pmUser = (user, ama, question) => {
  request('https://www.reddit.com/api/v1/access_token', {
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
  }, (err, response, body) => {
    if (!err && response.statusCode === 200) {
      console.log(body);
      const token = JSON.parse(body).access_token;
      request('https://oauth.reddit.com/api/compose', {
        method: 'POST',
        headers: {
          'Authorization': 'bearer ' + token,
          'User-Agent': 'confirm-bot-v1 by /u/amanowbot'
        },
        form: {
          'api_type': 'json',
          'subject': 'Your AMA Now question has been scheduled!',
          'text': 'Your question for ' + ama + ' has been scheduled. Your question:\n\n' + question,
          'to': user
        }
      }, (err, response, body) => {
        console.log('Confirmation status: ' + body);
      });
    }
  });
}

// Refreshes the access token
export const refreshToken = (refresh, amaTime, ama, question) => {
  console.log("Refreshing token...");
  const currentTime = Date.now();
  //const refresh = JSON.parse(body).refresh_token;
  console.log("refresh = " + refresh);
  request('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh
    },
    auth: {
      username: CLIENT_ID,
      password: CLIENT_SECRET
    }
  }, (err, response, body) => { // TODO: check if need to refresh again in case server restart
    getPost(err, response, body, amaTime, ama, question, refresh);
  });
}

// Gets a target post to comment on
const getPost = (err, response, body, amaTime, ama, question, refresh) => {
  if (!err && response.statusCode === 200) {
    const startMin = amaTime.getMinutes();
    const startHour = amaTime.getHours();
    const token = JSON.parse(body).access_token;
    const cron1 = `${startMin}-59/1 ${startHour} * * *`;
    const cron2 = `0-${startMin-1}/1 ${startHour+1} * * *`; // be sure to cancel if post found in cron1
    let found = false;
    //let cron = `${startMin}-${startMin + 59}/1 ${startHour} * * *`; // TODO: temp...make it an hour and accommodate for non-0 minute times (i.e., use two crons). Also start five minutes before to accoutn for early threads

    // TODO (NOT SURE IF POSSIBLE GIVEN THE WAY I'VE SET THIS UP): refactor into a single function passing in the cron, token, question, ama, refresh
    let job1 = Schedule.scheduleJob(cron1, () => {
      request('https://oauth.reddit.com/r/IAmA/new.json', { // TODO: change back to test subreddit for more testing
        method: 'GET',
        headers: {
          'Authorization': 'bearer' + token, // for some reason, this endpoint doesn't require a space after 'bearer'
          'User-Agent': 'ama-q-app-v by /u/amaschedtester'
        },
      }, (err, response, body) => {
        if (err) {
          console.log("Get post err: " + err);
        } else {
          const posts = JSON.parse(body).data.children;
          for (let post of posts) { // http://stackoverflow.com/questions/3010840/loop-through-an-array-in-javascript
            for (let person of ama.split(", ")) {
              if (post.data.title.toUpperCase().includes(person.toUpperCase()) ||
                  post.data.selftext.toUpperCase().includes(person.toUpperCase())) {
                console.log("Found post!");
                commentOnPost(token, post, question, refresh);
                found = true;
                job1.cancel();
                break;
              }
              if (found)
                break;
            }
          }
          if (!found) {
            console.log("Could not find post.");
          }
        }
      });
    });

    // Don't schedule cron2 if cron1 encompasses the entire hour
    if (startMin !== 0) {
      let job2 = Schedule.scheduleJob(cron2, () => {
        request('https://oauth.reddit.com/r/IAmA/new.json', { // TODO: change back to test subreddit for more testing
          method: 'GET',
          headers: {
            'Authorization': 'bearer' + token, // for some reason, this endpoint doesn't require a space after 'bearer'
            'User-Agent': 'ama-q-app-v by /u/amaschedtester'
          },
        }, (err, response, body) => {
          if (err) {
            console.log("Get post err: " + err);
          } else {
            if (found) { // cancel this job if post was already found from job 1
              job2.cancel();
            } else {
              const posts = JSON.parse(body).data.children;
              for (let post of posts) { // http://stackoverflow.com/questions/3010840/loop-through-an-array-in-javascript
                for (let person of ama.split(", ")) {
                  if (post.data.title.toUpperCase().includes(person.toUpperCase()) ||
                      post.data.selftext.toUpperCase().includes(person.toUpperCase())) {
                    console.log("Found post!");
                    commentOnPost(token, post, question, refresh);
                    found = true;
                    job2.cancel();
                    break;
                  }
                  if (found)
                    break;
                }
              }
            }
            if (!found) {
              console.log("Could not find post.");
            }
          }
        });
      });
    }
  }
}

const checkForPost = () => {
  request('https://oauth.reddit.com/r/IAmA/new.json', { // TODO: change back to test subreddit for more testing
    method: 'GET',
    headers: {
      'Authorization': 'bearer' + token, // for some reason, this endpoint doesn't require a space after 'bearer'
      'User-Agent': 'ama-q-app-v by /u/amaschedtester'
    },
  }, (err, response, body) => {
    if (err) {
      console.log("Get post err: " + err);
    } else {
      //let found = false;
      const posts = JSON.parse(body).data.children;
      for (let post of posts) { // http://stackoverflow.com/questions/3010840/loop-through-an-array-in-javascript
        for (let person of ama.split(", ")) {
          if (post.data.title.toUpperCase().includes(person.toUpperCase()) ||
              post.data.selftext.toUpperCase().includes(person.toUpperCase())) {
            console.log("Found post!");
            commentOnPost(token, post, question, refresh);
            found = true;
            job2.cancel();
            break;
          }
          if (found)
            break;
        }
      }
      if (!found) {
        console.log("Could not find post.");
      }
    }
  });
}

// Helper to comment on target post
const commentOnPost = (token, post, text, refresh) => {
  request('https://oauth.reddit.com/api/comment.json', {
    method: 'POST',
    headers: {
      'Authorization': 'bearer ' + token,
      'User-Agent': 'ama-q-app-v by /u/amaschedtester'
    },
    form: {
      'api_type': 'json',
      'thing_id': post.kind + '_' + post.data.id,
      'text': text
    },
  }, (err, response, body) => {
    if (err) {
      console.log("Comment err: " + err);
    } else {
      console.log('Body: ' + body);
      console.log(response.statusCode);
    }

    // Done with Job, so remove from DB
    Job.findOne({'refresh': refresh}).remove().exec();
  });
}

// Helper to replace % by fixing negative value mod issue: http://stackoverflow.com/questions/4467539/javascript-modulo-not-behaving
const mod = (n, m) => {
  return ((n % m) + m) % m;
}
