import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import Schedule from 'node-schedule';
import { retrieveToken, refreshToken } from './reddit-access';
import { getEvents } from './calendar';
import Job from './models/job-model';

import mongoose from 'mongoose';
import router from './router';

const app = express();
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost/ama';
mongoose.Promise = require('bluebird');
const conn = mongoose.connect(mongoURI);

app.use(cors());
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(express.static('public'));

app.use('/api', router);

app.get('/', (req, res) => {
  res.render('index');
});

const port = process.env.PORT || 6500;
app.listen(port, () => {
  const date = new Date();
  const cron = `${date.getSeconds()} ${date.getMinutes()} * * * *`
  Schedule.scheduleJob(cron, getEvents);

  // Re-schedule lost AMA jobs
  Job.find().exec((err, jobs) => {
    if (err) {
      console.log(err);
    } else if (jobs.length == 0) {
      console.log("No scheduled jobs in database.");
    }
    else {
      for (let job of jobs) {
        console.log("Rescheduling job with refresh token: " + job.refresh);
        Schedule.scheduleJob(job.date, () => {
          refreshToken(job.refresh, job.date, job.ama, job.question);
        });
      }
    }
  });
});

console.log(`listening on: ${port}`);
