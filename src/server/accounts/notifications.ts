import type { AccountServices } from './access.js';

/** One durable request per verified pending account; never an approval authority. */
export async function enqueueAccessRequestNotification(services:AccountServices,authorId:string){
  if(!services.config.accessRequestNotifyEmail)return;
  await services.pool.query("INSERT INTO access_request_notifications(author_id) SELECT id FROM authors WHERE id=$1 AND verified AND approval_status='pending' AND disabled_at IS NULL ON CONFLICT(author_id) DO NOTHING",[authorId]);
  await processAccessRequestNotifications(services,authorId);
}

/** Bounded retries and a lease prevent concurrent sends; SMTP delivery is not exactly-once. */
export async function processAccessRequestNotifications(services:AccountServices,authorId?:string){
  const recipient=services.config.accessRequestNotifyEmail;
  if(!recipient)return;
  // A worker can crash after its last send attempt; retain an explicit unconfirmed failure.
  await services.pool.query("UPDATE access_request_notifications SET status='failed' WHERE status='sending' AND attempts>=3 AND claimed_at<now()-interval '2 minutes'");
  for(let processed=0;processed<10;processed++){
    const claimed=await services.pool.query(`WITH candidate AS (
      SELECT n.author_id FROM access_request_notifications n JOIN authors a ON a.id=n.author_id
      WHERE a.verified AND a.approval_status='pending' AND a.disabled_at IS NULL AND n.attempts<3
        AND ($1::uuid IS NULL OR n.author_id=$1)
        AND ((n.status IN ('pending','failed') AND n.available_at<=now()) OR (n.status='sending' AND n.claimed_at<now()-interval '2 minutes'))
      ORDER BY n.available_at,n.author_id FOR UPDATE OF n SKIP LOCKED LIMIT 1
    ) UPDATE access_request_notifications n SET status='sending',attempts=n.attempts+1,claimed_at=now()
      FROM candidate c,authors a WHERE n.author_id=c.author_id AND a.id=n.author_id
      RETURNING n.author_id,n.attempts,a.email,a.display_name`,[authorId??null]);
    const request=claimed.rows[0];
    if(!request)return;
    try{
      const name=String(request.display_name).replace(/[\x00-\x1f\x7f]/g,' ');
      await services.mailer({to:recipient,subject:'OpenScroll access request',text:`A verified account has requested authoring access on ${services.config.origin}.\nSign in as this instance's owner to review pending accounts:\n${services.config.origin}/account/\n\nEmail: ${request.email}\nName: ${name}\n\nThis message does not approve access. Only an authenticated instance owner can make that decision.`});
      await services.pool.query(`WITH delivered AS (
        UPDATE access_request_notifications SET status='sent',sent_at=now() WHERE author_id=$1 AND status='sending' AND attempts=$2 RETURNING author_id
      ) UPDATE authors SET access_notified_at=now() WHERE id IN (SELECT author_id FROM delivered)`,[request.author_id,request.attempts]);
    }catch{
      await services.pool.query("UPDATE access_request_notifications SET status='failed',available_at=now()+interval '5 minutes' WHERE author_id=$1 AND status='sending' AND attempts=$2",[request.author_id,request.attempts]);
      console.error('An access request notification could not be delivered. Review pending accounts; delivery is retried up to three times.');
    }
  }
}
