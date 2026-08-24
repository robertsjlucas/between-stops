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
    title: "Present the experience",
    text: "Add a clear title, a short summary, an approximate duration and a strong landscape cover image.",
  },
  {
    number: "03",
    title: "Place each Story",
    text: "Place the Story point where its subject makes most sense from the route. Beyond the Stops uses that location to work out when the Story should play.",
  },
  {
    number: "04",
    title: "Give Stories room",
    text: "Keep audio focused and leave enough distance between Stories for one to finish before the next begins. Add an image or something to spot only when it improves the journey.",
  },
  {
    number: "05",
    title: "Test the route",
    text: "Travel every direction you intend to offer passengers. Check timing, Story triggers, audio levels and whether each subject appears at the right moment.",
  },
  {
    number: "06",
    title: "Prepare to publish",
    text: "Check your profile, experience details, media permissions and every Story before submitting.",
  },
];

export default function CreatorHelpPage() {
  return (
    <main className="creatorStudioShell creatorHelpShell">
      <header className="creatorBrandHeader">
        <div>
          <div className="creatorLogo">
            <img
              src="/branding/between-stops-logo-light.png?v=1"
              alt=""
            />
            <span>Beyond the Stops</span>
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
          A strong Beyond the Stops experience is
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
            app works out direction and adds
            the appropriate prompt.
          </p>

          <p>
            <strong>Remember:</strong> the
            Story point is not an exact
            playback button. It gives the
            journey engine the location it
            needs to trigger the Story at
            the right time.
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
              src="/branding/between-stops-logo-light.png?v=1"
              alt=""
            />
            <span>Beyond the Stops</span>
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
