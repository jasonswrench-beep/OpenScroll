import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyRequest } from 'fastify';
import { accountView, HttpError, requireAccount, requireAuthor, requireOwner, type Principal } from '../src/server/accounts/access.js';

const fixture: Principal = {
  id: '00000000-0000-4000-8000-000000000001', email: 'synthetic@example.invalid', name: 'Synthetic author',
  csrf: 'private-session-csrf', role: 'author', approvalStatus: 'pending', verified: true,
};
function request(author: Principal | null, method = 'GET', csrf?: string): FastifyRequest {
  return { author, method, headers: csrf === undefined ? {} : { 'x-csrf-token': csrf } } as FastifyRequest;
}
const denied = (status: number) => (error: unknown) => error instanceof HttpError && error.statusCode === status;

test('account access requires a session and protects account changes with CSRF while permitting pending account views', () => {
  assert.throws(() => requireAccount(request(null)), denied(401));
  assert.equal(requireAccount(request(fixture)), fixture);
  assert.throws(() => requireAccount(request(fixture, 'POST')), denied(403));
  assert.throws(() => requireAccount(request(fixture, 'POST', 'different-session')), denied(403));
  assert.equal(requireAccount(request(fixture, 'POST', fixture.csrf)), fixture);
});

test('author and owner guards require approval and verification independently of the claimed role', () => {
  for (const role of ['owner', 'author'] as const) {
    for (const approvalStatus of ['pending', 'approved', 'revoked'] as const) {
      for (const verified of [false, true]) {
        const principal = { ...fixture, role, approvalStatus, verified };
        const authorAllowed = verified && approvalStatus === 'approved';
        if (authorAllowed) assert.equal(requireAuthor(request(principal)), principal);
        else assert.throws(() => requireAuthor(request(principal)), denied(403), `${role}/${approvalStatus}/${verified}`);
        if (authorAllowed && role === 'owner') assert.equal(requireOwner(request(principal)), principal);
        else assert.throws(() => requireOwner(request(principal)), denied(403), `${role}/${approvalStatus}/${verified}`);
      }
    }
  }
  assert.throws(() => requireAuthor(request(null)), denied(401));
  assert.throws(() => requireOwner(request(null)), denied(401));
});

test('approved owner and author writes still require the current session CSRF token', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const role of ['owner', 'author'] as const) {
      const principal: Principal = { ...fixture, role, approvalStatus: 'approved' };
      assert.throws(() => requireAuthor(request(principal, method)), denied(403), `${role} ${method}`);
      assert.equal(requireAuthor(request(principal, method, principal.csrf)), principal);
      if (role === 'owner') {
        assert.throws(() => requireOwner(request(principal, method)), denied(403));
        assert.equal(requireOwner(request(principal, method, principal.csrf)), principal);
      }
    }
  }
});

test('public account state carries access status without exposing the session CSRF secret', () => {
  const state = accountView(fixture);
  assert.deepEqual(state, {
    id: fixture.id, email: fixture.email, name: fixture.name,
    role: 'author', approvalStatus: 'pending', verified: true,
  });
  assert.equal('csrf' in state, false);
  assert.equal(JSON.stringify(state).includes(fixture.csrf), false);
});
