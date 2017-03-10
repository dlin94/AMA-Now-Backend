import request from 'request';
import Schedule from 'node-schedule';
import Event from './models/event-model';
import Job from './models/job-model';

const CLIENT_ID = process.env.APP_CLIENT_ID;
const CLIENT_SECRET = process.env.APP_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://127.0.0.1:8080/submit';
const BOT_USER = process.env.BOT_USER;
const BOT_PASS = process.env.BOT_PASS;
const BOT_ID = process.env.BOT_ID;
const BOT_SECRET = process.env.BOT_SECRET;
const HOUR_MS = 3600000;

/******************************************************************************/
//
// Public functions
//
/******************************************************************************/

/*
* Main function to retrieve access token.
*/
export const retrieveToken = (req, res) => {
  console.log(req.body.code);
  console.log(req.body.ama);
  console.log(req.body.question);

  // Find the requested AMA event
  Event.findOne({people: req.body.ama.split(", ")}).exec((err, ev) => { // ev is null if not found
    console.log(`Event: ${ev}`);
    const currentTime = Date.now();
    const amaTime = new Date(new Date(ev.date).getTime() - HOUR_MS/4); // Start checking 15 mins before scheduled time
    //const amaTime = new Date(Date.now() + HOUR_MS/60*2);
    //const amaTime = new Date(2017, 2, 3, 22, 0, 0, 0);
    console.log("Retrieving access token");

    // Request access token
    request('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      form: {
        grant_type: 'authorization_code',
        code: req.body.code, //req.query.code,
        redirect_uri: REDIRECT_URI
      },
      auth: {
        username: CLIENT_ID,
        password: CLIENT_SECRET
      }
    }, (err, response, body) => {
      const refresh = JSON.parse(body).refresh_token;
      // If AMA is more than an hour later, schedule a token refresh
      if (amaTime - currentTime > (HOUR_MS)) {
        console.log(body);
        console.log("Scheduling to refresh token.");
        Schedule.scheduleJob(amaTime, () => {
          refreshToken(refresh, amaTime, req.body.ama, req.body.question);
        });
      }
      // If AMA is within the hour, just schedule to check
      else {
        console.log("Scheduling to check posts...");
        console.log(body);
        getPost(err, response, body, amaTime, req.body.ama, req.body.question, refresh);
      }
      // Save the job in database in case the server restarts
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

/*
* Refreshes access token.
*/
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

/******************************************************************************/
//
// Helper functions
//
/******************************************************************************/

/*
* Gets the name of the user and sends a confirmation to him via PM.
*/
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

/*
* Helper to PM the user with bot.
*/
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
      username: BOT_ID,
      password: BOT_SECRET
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

/*
* Checks for the target post.
*/
const getPost = (err, response, body, amaTime, ama, question, refresh) => {
  if (!err && response.statusCode === 200) {
    const startMin = amaTime.getMinutes();
    const startHour = amaTime.getHours();
    const token = JSON.parse(body).access_token;
    const cron1 = `${startMin}-59/1 ${startHour} * * *`;
    const cron2 = `0-${startMin-1}/1 ${startHour+1} * * *`;
    let found = false; // true if post is found

    // Schedule the first batch of check jobs, checking every minute
    let job1 = Schedule.scheduleJob(cron1, () => {
      request('https://oauth.reddit.com/r/IAmA/new.json', {
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
          // Loop through each post in /new
          for (let post of posts) {
            // Check if data or selftext contains the people of interest.
            for (let person of ama.split(", ")) {
              if (post.data.title.toUpperCase().includes(person.toUpperCase()) ||
                  post.data.selftext.toUpperCase().includes(person.toUpperCase())) {
                console.log("Found post!");
                commentOnPost(token, post, question, refresh);
                found = true;
                job1.cancel(); // Cancel the rest of the check jobs
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

    if (startMin !== 0) {
      let job2 = Schedule.scheduleJob(cron2, () => {
        request('https://oauth.reddit.com/r/IAmA/new.json', {
          method: 'GET',
          headers: {
            'Authorization': 'bearer' + token,
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
              for (let post of posts) {
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

/*
* Comment on the target post with the question that was asked.
*/
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

// Helper to replace % by fixing negative value mod issues
//const mod = (n, m) => {
//  return ((n % m) + m) % m;
//}
