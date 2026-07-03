// Weave API Evangelist governance services into the app. Every action routes to
// info@apievangelist.com over a mailto link, with the current context pre-filled
// — so engagement works even in a forked or fully local copy, with no backend.
// Spectral Ruleset Studio is free, open tooling; API Evangelist sells the expert
// services around it, and this is the always-present front door to them.
const EMAIL = 'info@apievangelist.com';
const APP = 'Spectral Ruleset Studio';
const SERVICES_URL = 'https://apievangelist.com/services/';

interface Service {
  title: string;
  blurb: string;
  cta: string;
  subject: string;
  url: string; // API Evangelist service detail page
  body: (ctx: string) => string;
}

// People arrive here trying to turn a style guide into rules — so rules,
// policies, and reviews lead.
const SERVICES: Service[] = [
  {
    title: 'Rules',
    blurb: 'Encode your organization’s standards as portable, machine-readable Spectral rules — owned, grounded, and named — that you can run in CI, the editor, and the browser.',
    cta: 'Author our ruleset',
    url: `${SERVICES_URL}governance/rules/`,
    subject: 'Custom ruleset engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe’re distilling our style guide into a Spectral ruleset and would like expert help making it owned and grounded.\n\n${ctx}\n\nWhat does an engagement look like?\n\nThanks,`,
  },
  {
    title: 'Policies',
    blurb: 'Turn the prose in your style guide into the policies your rules enforce — the decisions about what a good API means at your organization.',
    cta: 'Shape our policies',
    url: `${SERVICES_URL}governance/policies/`,
    subject: 'API governance policies engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe’d like help turning our style guide prose into clear API policies that our Spectral rules can enforce.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Reviews',
    blurb: 'Formal reviews of your API artifacts and of the policies, rules, and pipelines that govern them — against best practices, OWASP, and your own standards.',
    cta: 'Request a review',
    url: `${SERVICES_URL}governance/reviews/`,
    subject: 'API governance review request',
    body: (ctx) => `Hi API Evangelist,\n\nWe’d like a governance review of the ruleset we’re building and the standards behind it.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Pipelines',
    blurb: 'Stand up the CI/CD pipelines that run your owned ruleset as a governance gate at the pull request — sparingly, and never silently.',
    cta: 'Automate governance',
    url: `${SERVICES_URL}governance/pipelines/`,
    subject: 'API governance pipelines engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe’d like to wire our Spectral ruleset into CI as a gate that informs rather than punishes.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Vocabulary',
    blurb: 'Map the words, casings, and naming conventions your rules depend on, so “consistent” stops being prose and becomes something a rule can check.',
    cta: 'Define our vocabulary',
    url: `${SERVICES_URL}discovery/vocabulary/`,
    subject: 'API vocabulary engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe’d like help defining the vocabulary and naming conventions our ruleset should enforce.\n\n${ctx}\n\nThanks,`,
  },
  {
    title: 'Standards',
    blurb: 'Identify and develop the standards that keep every aspect of your API operations interoperable — the ground your ruleset stands on.',
    cta: 'Develop standards',
    url: `${SERVICES_URL}discovery/standards/`,
    subject: 'API standards engagement',
    body: (ctx) => `Hi API Evangelist,\n\nWe’d like help identifying and developing the standards our API operations need.\n\n${ctx}\n\nThanks,`,
  },
];

function mailto(s: Service, ctx: string): string {
  const body = `${s.body(ctx)}\n\n— sent from ${APP} (studio.apicommons.org)`;
  return `mailto:${EMAIL}?subject=${encodeURIComponent(s.subject)}&body=${encodeURIComponent(body)}`;
}

// context: () => a short, plain-text summary of what the user is looking at, woven
// into the email so the engagement starts with real detail.
export function initEngage(context: () => string): void {
  const btn = document.getElementById('engage-ae');
  if (!btn) return;

  const modal = document.createElement('div');
  modal.className = 'modal engage-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card engage-card">
      <div class="modal-head">
        <span id="modal-title">Work with API Evangelist</span>
        <button type="button" class="engage-close" aria-label="Close">×</button>
      </div>
      <div class="engage-body">
        <p class="engage-intro">Spectral Ruleset Studio is open and free to run yourself. When you want experts in the loop,
          <a href="https://apievangelist.com" target="_blank" rel="noopener">API Evangelist</a> offers governance
          services — every option below opens an email to
          <a id="engage-email" href="mailto:${EMAIL}">${EMAIL}</a> with your current context filled in.</p>
        <div class="engage-services"></div>
        <p class="engage-foot"><a href="${SERVICES_URL}" target="_blank" rel="noopener">See all governance services →</a></p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const listEl = modal.querySelector('.engage-services') as HTMLElement;
  const emailEl = modal.querySelector('#engage-email') as HTMLAnchorElement;
  const close = () => { modal.hidden = true; };

  function render(): void {
    const ctx = context();
    listEl.innerHTML = SERVICES.map((s, i) => `
      <div class="engage-service">
        <div class="engage-service-text"><strong>${s.title}</strong><span>${s.blurb}</span>
          <a class="engage-details" href="${s.url}" target="_blank" rel="noopener">details ↗</a></div>
        <a class="engage-cta" href="${mailto(s, ctx)}" data-i="${i}">${s.cta}</a>
      </div>`).join('');
    emailEl.href = mailto(SERVICES[0], ctx);
  }

  btn.addEventListener('click', () => { render(); modal.hidden = false; });
  modal.querySelector('.engage-close')!.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
