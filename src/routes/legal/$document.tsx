import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { legalLinks, LEGAL_VERSION } from '@/lib/legal';

const documents = {
  terms: {
    title: 'Terms of Service',
    sections: [
       ['Who can join', 'You must be 13 or older and give your real birthday to create an account. Ages 13–17 can create their own account, but can only join a trip with that trip\'s join code, and only after the Captain approves them. Once approved, a teen sees only that one trip, gets Family content only, and can\'t be a Captain or Co-Captain. A Captain can also send a teen invite link made with a parent or guardian\'s permission. Under 13 can\'t have an account yet (Family Mode is coming later). Accounts with false ages are removed. Play responsibly and follow local laws.'],
      ['Age tiers', 'Captains are 21+. Players 18–20 can play trip games, but need the Captain\'s approval to join a trip, become Co-Captain or share an experience, and never see drink or 21+ content. Teens 13–17 see family-safe content only and can\'t use Game Rooms, AI, purchases or posting. Game Rooms requests are 21+.'],
      ['Captains', 'Captains are responsible for who they invite, including teens they invite with parent permission.'],
      ['Your content', 'You own what you post. You give TripJunkies permission to display it in the app to the people you share it with. We may moderate or remove content and suspend accounts that break our Community Guidelines.'],
      ['What TripJunkies does', 'TripJunkies is a games-and-planning app. We do not book travel, sell tickets, hold or move money, or guarantee any trip, venue or other user. Members are responsible for their travel, costs and safety.'],
       ['Games and suggestions', '21+ content is limited to people whose stored age is at least 21 and whom their trip Captain has approved. A typed birthday is not identity verification. AI suggestions can be wrong: check them before relying on them. Games are for fun; never drink and drive or attempt unsafe or illegal challenges.'],
      ['Service and liability', 'Beta features may change. The service is provided “as is,” without warranties. To the extent the law allows, TripJunkies is not liable for losses arising from travel, other users or use of the app. This does not limit rights that cannot legally be excluded.'],
      ['Leaving and contact', 'Delete your account any time in Me → Settings. Questions: hello@tripjunkies.app. Copyright or takedown requests: safety@tripjunkies.app.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      ['What we collect', 'We collect your account email, profile and player card, trip data, photos you upload, game activity, basic device and usage data, and AI usage counts.'],
      ['Why we use it', 'We use this information to run the app, keep games fair, protect members and improve TripJunkies. AI requests are processed by our AI provider to generate content. We do not sell personal data.'],
      ['Who can see it', 'Only your trip members can see your trip content. Uploaded photos are private and shared using expiring links. Real names are never shown publicly.'],
      ['Birthdays and teens', 'Your birthday is saved once and stays private; Captains only see an age range (Teen, 18–20 or 21+). Teens 13–17 may create an account and record their birthday, can join a trip only with a join code and the Captain\'s approval (or through a teen invite made with parent or guardian permission), see only that one trip with Family content only, and their names never appear outside their own trips. We don\'t knowingly keep accounts for anyone under 13.'],
      ['Keeping and deleting data', 'We keep information while it is needed to run the app and for safety. Delete your account and its data in Me → Settings. Questions about your data: support@tripjunkies.app.'],
    ],
  },
  guidelines: {
    title: 'Community Guidelines',
    sections: [
      ['Be kind', 'No harassment, hate or threats. Never share sexual content involving anyone under 18.'],
      ['Respect privacy', 'Do not share someone else’s private information or photos without permission.'],
      ['Celebrate cultures', 'Travel From Home and Window Seat are for celebrating cultures, not mocking them.'],
      ['Stay safe', 'No unsafe dares or illegal challenges. Report problems to safety@tripjunkies.app.'],
    ],
  },
} as const;

type DocumentKey = keyof typeof documents;
export const Route = createFileRoute('/legal/$document')({
  beforeLoad: ({ params }) => { if (!(params.document in documents)) throw notFound(); },
  head: ({ params }) => {
    const doc = documents[params.document as DocumentKey];
     const title = `${doc?.title ?? 'Legal'} | TripJunkies™`;
    const description = `Read the TripJunkies ${doc?.title ?? 'legal information'}.`;
    return { meta: [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }, { property: 'og:type', content: 'article' }, { name: 'twitter:card', content: 'summary' }] };
  },
  component: LegalDocument,
});
function LegalDocument() {
  const { document } = Route.useParams();
  const doc = documents[document as DocumentKey];
  if (!doc) return null;
  return <main className="min-h-dvh mx-auto max-w-2xl px-5 pb-24 pt-8 text-foreground">
     <Link to="/" className="text-sm font-semibold text-primary">← TripJunkies™</Link>
     <h1 className="mt-8 font-display text-4xl font-extrabold">TripJunkies™ {doc.title}</h1>
    <div className="mt-8 space-y-7">{doc.sections.map(([heading, text]) => <section key={heading}><h2 className="font-display text-xl font-bold">{heading}</h2><p className="mt-2 leading-relaxed text-muted-foreground">{text}</p></section>)}</div>
    <p className="mt-8 text-sm">{document === 'guidelines' ? 'Urgent? ' : 'Questions? '}{document === 'guidelines' ? <a className="text-primary underline" href="mailto:safety@tripjunkies.app">Email safety@tripjunkies.app</a> : <a className="text-primary underline" href={`mailto:${document === 'privacy' ? 'support' : 'hello'}@tripjunkies.app`}>{document === 'privacy' ? 'support' : 'hello'}@tripjunkies.app</a>}</p>
    <nav className="mt-8 flex flex-wrap gap-4 text-sm">{legalLinks.filter(l => l.href !== `/legal/${document}`).map(l => <Link key={l.href} to="/legal/$document" params={{ document: l.href.split("/").pop() || "terms" }} className="text-primary underline">{l.label}</Link>)}</nav>
    <p className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">Last updated {new Date(`${LEGAL_VERSION}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</p>
  </main>;
}
