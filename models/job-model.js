import mongoose, {Schema} from 'mongoose';

const JobSchema = new Schema({
  date: Date,
  refresh: String,
  ama: String,
  question: String
});

mongoose.Promise = require('bluebird');
const JobModel = mongoose.model('Job', JobSchema);

export default JobModel;
