# Brightspace test course · Revision 4

Confirm that the visible course title ends in Revision 4. Import as a NEW activity, rather than reopening the earlier test activity.

Import the two ZIPs as separate SCORM activities. Keep the .openscroll file for editing; do not import it into Brightspace. Record Brightspace release, SCORM engine, launch settings and gradebook mapping.

1. Explore both tabs, then choose Complete lesson and continue (one action). Sequential navigation must prevent entering lesson 2 before lesson 1 is complete.
2. In lesson 2 submit one wrong answer, leave the fill-in response as "prac", Save LMS progress and Exit course. Relaunch the same attempt: confirm lesson, draft and used attempt persist.
3. Passing run: fill in all five responses, choose Submit all answers, then Complete lesson. Answer four of five correctly for 80%. Confirm grade 80 and passed; 2004 completion should also be completed.
4. Failing run: use a separate learner or a new LMS attempt, answer three correctly (60%) and complete. Confirm grade 60 and failed. Completion and success are separate in 2004; 1.2 has one combined status.
5. Verify that selecting an occupied matching choice swaps assignments visibly; there must be no duplicate-match dead end. Verify session time, retry limits, review launch and popup/frame launch as configured. Record actual results; these exports have not been tested in Brightspace yet.

## Answer key (tester only)

- Multiple choice: Try a small, practical step.
- Multiple response: Practice a small step; Reflect on what changed.
- Fill in: practice (case-insensitive).
- Matching: Notice → Identify what matters; Act → Try one useful step.
- Sorting: Notice what matters → Try a useful step → Reflect on the result.

Two attempts per question; all questions must be submitted but wrong answers do not prevent completing the lesson. Use separate LMS attempts/learners to test independent pass/fail outcomes. Reset progress inside the SCO does not create a new LMS attempt or guarantee gradebook reset.

For full limits and checklist see docs/SCORM-PUBLISHING.md in the source repository.
