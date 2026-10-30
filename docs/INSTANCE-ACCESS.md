# Instance owner approval

Each OpenScroll installation controls its own users. Requesting an account,
verifying an email address and receiving authoring approval are separate steps.
There is no central approval service or required account on another installation.

The public homepage links to self-hosting instructions. `/account/` handles
access requests, sign-in, verification, password recovery and pending status.
Only verified, approved accounts can open `/app/` or use project, publishing,
preview and library APIs. Existing ownership checks still keep each author's
courses private; owner status manages access and does not grant access to other
authors' course contents.

Set `REGISTRATION_ENABLED=true` to accept requests. Production requires email
verification. New accounts remain pending until an instance owner approves them.
An approved owner can review accounts at `/account/#requests`, approve verified
requests, and revoke access. Approval and revocation invalidate the affected
account's old sessions; the user signs in again. Password recovery or email
verification never grants approval. Suspension remains separate from approval.

## Owner bootstrap and migration

Owner authority is provisioned through the trusted host CLI. Public registration
never creates an owner, including the first public signup. The operator must
verify the account identity and supply both its exact UUID and matching email.
No owner email is hardcoded into OpenScroll.

Migration 5 preserves all account, course, asset, reusable-item and snapshot data.
It marks existing accounts pending and gives them the ordinary author role,
without grandfathering any account. It invalidates existing sessions and account
recovery/verification tokens. No account or authored data is deleted. An existing
intended owner's UUID, email, password hash and authored data remain intact; the
trusted bootstrap step restores approved owner access explicitly.

Plan the cutover before running the production migration:

1. Take and verify a database backup. Use the existing operator account list to
   identify the intended account by UUID and verified email. Do not select an
   account only because it was created first.
2. Keep authoring unavailable during the migration and owner bootstrap. Apply
   migration 5 using the documented deployment procedure.
3. Run the private, read-only review report, then bootstrap the intended owner:

   ```sh
   deploy/ops.sh admin list
   deploy/ops.sh admin review-accounts "$OWNER_ACCOUNT_ID" "$OWNER_ACCOUNT_EMAIL"
   deploy/ops.sh admin bootstrap-owner "$OWNER_ACCOUNT_ID" "$OWNER_ACCOUNT_EMAIL"
   ```

   These variables are operator-supplied identity confirmations, not defaults.
   The report lists unexpected accounts for review without deleting them. Keep
   it private: it contains account identities. Bootstrap refuses a mismatched,
   unverified or suspended account. Investigate such a state before changing it.
4. Sign in afresh and verify the owner's existing courses. Other accounts remain
   pending until explicitly approved, with their data preserved.

For a new installation, use the existing `create-author EMAIL NAME` CLI command
with a password on standard input, verify the email owner, review its returned
UUID, then use the same explicit bootstrap command. The last active owner cannot
be revoked or suspended. A trusted host operator can explicitly bootstrap an
additional verified account for recovery; a public request cannot do this.

## Request notifications

`ACCESS_REQUEST_NOTIFY_EMAIL` is an optional single notification recipient. It is
independent of the owner login, `SMTP_USER`, `MAIL_FROM` and SMTP credentials.
Configure the recipient through the private deployment environment; existing
SMTP transport settings continue to provide delivery. Do not put private
addresses or credentials in source control.

Notifications are queued only for verified pending requests. The email directs
the owner to sign in and review requests; it does not carry a one-click approval
token. Duplicate requests/verification do not grant access or create duplicate
queue entries. Delivery retries are bounded, and the owner queue remains the
authoritative list if mail delivery fails. Logs do not claim SMTP acceptance is
proof that a person received or read an email. Local tests use an outbox or mocks.

## Public learner examples

The public landing page and static learner publications are separate from
authoring access. When sample content is selected later, publish reviewed,
prebuilt standalone HTML courses and their local assets. Learner navigation,
practice and browser-local progress can work without an authoring account or
OpenScroll API. Do not expose generic import/export/PDF endpoints or private
course identifiers to implement a public demo. No sample courses are added by
this change.

Existing root `/#verify=...` and `/#reset=...` links are forwarded to the account
flow while keeping tokens in fragments, not query strings or server logs. Tokens
invalidated during the security migration must be requested again.

Owner approval reduces who can invoke native rendering. It does not fix browser
or native-library vulnerabilities or provide a separate PDF worker boundary.
Keep the renderer mitigation and deployment review requirements from
`CONTAINER-SECURITY.md`; this feature does not authorize a deployment.
