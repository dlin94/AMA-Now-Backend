import { Router } from 'express';
import { retrieveToken } from './reddit-access';
import { getSchedule } from './calendar';

const router = Router();
router.route('/comment')
  .post(retrieveToken);

router.route('/schedule')
  .get(getSchedule);


export default router;
