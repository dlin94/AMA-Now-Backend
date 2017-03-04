import request from 'request';
import Schedule from 'node-schedule';
import Event from './models/event-model';

//  https://www.reddit.com/api/v1/authorize?client_id=kPpo2pzRIdkrMw&response_type=code&state=randomstring&redirect_uri=http://127.0.0.1:6500/authorize_callback&duration=permanent&scope=submit identity
const CLIENT_ID = process.env.APP_CLIENT_ID || 'kPpo2pzRIdkrMw'; // TODO: make these env variables
const CLIENT_SECRET = process.env.APP_CLIENT_SECRET || 'jeUuCI6R2s1O5XfTh5EYvEA-LuM';
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://amanow.surge.sh/submit'; //'http://127.0.0.1:8080/submit';
const BOT_USER = process.env.BOT_USER || 'amanowbot';
const BOT_PASS = process.env.BOT_PASS || '283954';
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
    const amaTime = new Date(ev.date);
    //const amaTime = new Date(2017, 2, 1, 1, 30, 0, 0);
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
      if (amaTime - currentTime > (HOUR_MS)) { // if AMA is much later, schedule a token refresh
        console.log(body);
        console.log("Scheduling to refresh token.");
        Schedule.scheduleJob(amaTime, () => { // TODO: Check if scheduling refresh at amaTime is correct
          refreshToken(response, body, amaTime, req.body.ama, req.body.question);
        });
      }
      else { // AMA is within the hour, so schedule to check
        console.log("Scheduling to check posts...");
        console.log(body);
        getPosts(err, response, body, amaTime, req.body.ama, req.body.question);
      }
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
const refreshToken = (response, body, amaTime, ama, question) => {
  console.log("Refreshing token...");
  const currentTime = Date.now();
  const refresh = JSON.parse(body).refresh_token;
  console.log("refresh = " + refresh);
  request('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh
    },
    auth: {
      username: CLIENT_ID,
      password: CLIENT_SECRET // TODO: make this env variable
    }
  }, (err, response, body) => {
    getPosts(err, response, body, amaTime, ama, question);
  });
}

// Gets a target post to comment on
const getPosts = (err, response, body, amaTime, ama, question) => {
  if (!err && response.statusCode === 200) {
    const startMin = amaTime.getMinutes();
    const startHour = amaTime.getHours();
    let cron = '';
    //let cron2 = ''; // be sure to cancel if post found in cron1
    cron = `${startMin}-${startMin + 59}/1 ${startHour} * * *`; // TODO: temp...make it an hour and accommodate for non-0 minute times (i.e., use two crons). Also start five minutes before to accoutn for early threads

    let job = Schedule.scheduleJob(cron, () => {
      const token = JSON.parse(body).access_token;
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
          //console.log(body);
          let found = false;
          const posts = JSON.parse(body).data.children;
          for (let post of posts) { // http://stackoverflow.com/questions/3010840/loop-through-an-array-in-javascript
            if (post.data.title.toUpperCase().includes(ama.toUpperCase()) || post.data.selftext.toUpperCase().includes(ama.toUpperCase())) { // TODO: may not work with multiple people in ama arg..needs to be split
              console.log("Found post!");
              commentOnPost(err, token, post, question);
              found = true;
              job.cancel();
              break;
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

// Helper to comment on target post
const commentOnPost = (err, token, post, text) => {
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
  });
}
