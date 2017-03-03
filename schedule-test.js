import Schedule from 'node-schedule';

for (let i = 0; i <= 59; i++) {
  const date = new Date(2017, 1, 26, 15, 0, i);
  Schedule.scheduleJob(date, () => {
    console.log("Second: " + i);
  });
}
/*
  TODO: Workflow
  1. Create a test reddit account. Under that account, create a test subreddit.
  2. Start by scheduling simple posts to that subreddit under that account.
     Account must grant access to application for this to work. Make sure to
     account for refresh tokens.
  3. Create posts with AMA-like titles, and see if the application can detect
     and comment in them.
  4. Use Google Calendar API to access AMA schedule information.

  u/amaschedtester
  p:283954

  r/testingstuffasdf

  https://www.reddit.com/api/v1/authorize?client_id=Keqt6slB_W2tuw&response_type=code&state=randomstring&redirect_uri=http://127.0.0.1:6500/authorize_callback&duration=permanent&scope=submit
*/
