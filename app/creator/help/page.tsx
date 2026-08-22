import "../creator.css";
import "./help.css";

const steps = [
  {
    number: "01",
    title: "Choose the journey",
    text: "Select the transport route and use either the whole journey or a section between two stops.",
  },
  {
    number: "02",
    title: "Present the tour",
    text: "Add a clear title, a short summary, an approximate duration and a strong landscape cover image.",
  },
  {
    number: "03",
    title: "Place each Story",
    text: "Put the pin on the actual building, view or object the Story is about. Story order follows the route automatically.",
  },
  {
    number: "04",
    title: "Keep it focused",
    text: "Use short audio, one useful image or one clear thing to spot. Each Story should earn its place in the journey.",
  },
  {
    number: "05",
    title: "Test the route",
    text: "Travel the journey in both directions. Check timing, GPS triggers, audio levels and whether the subject is genuinely visible.",
  },
  {
    number: "06",
    title: "Prepare to publish",
    text: "Check your profile, tour details, media permissions and every Story before submitting the finished experience.",
  },
];

export default function CreatorHelpPage() {
  return (
    <main className="creatorStudioShell creatorHelpShell">
      <header className="creatorBrandHeader">
        <div>
          <div className="creatorLogo">
            <img
              src="/branding/between-stops-icon-v2.png"
              alt=""
            />
            <span>Between Stops</span>
          </div>

          <p className="creatorAreaLabel">
            Creator guide
          </p>
        </div>

        <a
          className="helpBackButton"
          href="/creator"
        >
          Back to Creator
        </a>
      </header>

      <section className="helpHero">
        <p className="creatorKicker">
          HOW TO BUILD YOUR EXPERIENCE
        </p>

        <h1>
          Build for the journey,
          not around it.
        </h1>

        <p>
          A strong Between Stops tour is
          clear, well paced and worth
          looking up from your phone for.
        </p>
      </section>

      <section className="helpSteps">
        {steps.map((step) => (
          <article key={step.number}>
            <span>{step.number}</span>

            <div>
              <h2>{step.title}</h2>
              <p>{step.text}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="helpRules">
        <p className="creatorKicker">
          KEEP IN MIND
        </p>

        <div>
          <p>
            <strong>Do:</strong> write for
            someone who is moving, looking
            and listening.
          </p>

          <p>
            <strong>Avoid:</strong> saying
            “look left” or “look right”. The
            app will handle direction.
          </p>

          <p>
            <strong>Always:</strong> use
            media you own or have permission
            to publish.
          </p>
        </div>
      </section>

      <div className="helpAction">
        <a href="/creator">
          Start or continue an experience
        </a>
      </div>

      <footer className="creatorFooter">
        <div>
          <strong className="creatorFooterBrand">
            <img
              src="/branding/between-stops-icon-v2.png"
              alt=""
            />
            <span>Between Stops</span>
          </strong>
          <span>
            Creator guidance will develop
            as the platform is tested.
          </span>
        </div>

        <nav aria-label="Creator information">
          <span>Privacy coming soon</span>
          <span>Creator terms coming soon</span>
          <span>Contact coming soon</span>
        </nav>
      </footer>
    </main>
  );
}
