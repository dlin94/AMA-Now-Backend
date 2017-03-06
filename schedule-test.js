import Schedule from 'node-schedule';

const f = () => {
  let found = false;

  let date = new Date(Date.now() + 2000);
  Schedule.scheduleJob(date, () => {
    console.log("Hello from job 1!");
    found = true;
  });

  date = new Date(Date.now() + 5000);
  let job2 = Schedule.scheduleJob(date, () => {
    if (!found) // should not execute if found was changed to true in job 1
      console.log("Hello from job 2!");
  });

  console.log("Hello from end of function!") // should execute first
}

f();
