import request from 'request';
import Event from './models/event-model';
import Job from './models/job-model';

const CALENDAR_ID = process.env.CALENDAR_ID || 'amaverify@gmail.com';
const API_KEY = process.env.CALENDAR_API_KEY;

/******************************************************************************/
//
// Public functions
//
/******************************************************************************/

/*
* Makes a GET request to Google Calendars API to get the AMA schedule. Saves the
* events in the database.
*/
export const getEvents = () => {
  Event.collection.drop();
  const timeMin = (new Date()).toISOString();
  request(`https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events?key=${API_KEY}&timeMin=${timeMin}`, {
    method: 'GET'
  }, (err, response, body) => {
    if (err) {
      console.log("Error: " + err);
    } else {
      const events = JSON.parse(body).items;
      for (let e of events) {
        const subjects = getSubjects(e.summary);
        Event.find({'people': subjects}).exec((err, ev) => {
          if (err) {
            console.log(err);
          }
          else {
            if (ev.length == 0) {
              console.log(`Adding ${subjects} to DB!`);
              const event = new Event();
              event.date = e.start.dateTime;
              event.people = subjects;
              event.save()
              .then(result => {
                //console.log("Result: " + result);
              })
              .catch(err => {
                //console.log("Error: d" + err);
              });
            }
          }
        });
      }
    }
  });
}

/*
* Retrieves all the events in the database.
*/
export const getSchedule = (req, res) => {
  Event.find().select('people date -_id').exec((err, ev) => {
    if (err) {
      console.log(err);
      res.send(err);
    } else {
      res.json(ev);
    }
  })
}


/******************************************************************************/
//
// Helper functions
//
/******************************************************************************/

/*
* Helper to parse calendar data.
*/
const getSubjects = (summary) => {
  let subjects = null;
  if (summary.startsWith("[")) { // remove brackets
    const n = summary.indexOf("]")
    summary = summary.slice(1,n);
  }

  if (summary.includes(",")) {
    subjects = summary.split(", ");
    const last = subjects.length-1;
    if (subjects[last].includes("and ")) {
      subjects[last] = subjects[last].replace("and ", "");
    } else if (subjects[last].includes("& ")){
      subjects[last] = subjects[last].replace("& ", "");
    }
  } else if (summary.includes("and")) {
    subjects = summary.split(" and ");
  } else {
    subjects = summary.split(" & ");
  }
  return subjects;
}
