import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import Schedule from 'node-schedule';
import { retrieveToken } from './reddit-access';
import { getEvents } from './calendar';
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
});

console.log(`listening on: ${port}`);
