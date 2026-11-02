import { Link } from "react-router-dom";
import { CONTACT_EMAIL, OPERATOR, TERMS_UPDATED } from "../lib/legal";

// A plain-English acceptable-use page. Deliberately short: a document nobody reads is worse
// than a short one people might. Aayush owns the wording; this is a starting draft, and the
// contact address is the one thing here that MUST be kept true.
//
// CHANGING THE WORDING BELOW? Bump TERMS_VERSION and TERMS_UPDATED, both in
// lib/legal.ts, or people are never re-asked and the stored acceptance claims they agreed to
// text they never saw. src/components/TermsGate.version.test.ts now FAILS if you forget.
//
// TermsGate renders a link to this page, and it sits OUTSIDE RequireAuth in routes.tsx so a
// signed-out visitor can read it before deciding to sign up.
//
// FOUR SECTIONS HERE ARE LOAD-BEARING AND MUST NOT BE SOFTENED TO SAVE WORDS:
//   - "Permission to show them", the only licence that lets this app store a photo, display a
//     recipe, and let another cook keep a saved copy. Potluck's whole behaviour ("a saved copy
//     is a real copy") rests on that one paragraph; before it existed, the app did something
//     the terms never asked permission for.
//   - "Cooking from what you find here", because an AI that misreads tsp as tbsp or drops a
//     nut from a handwritten card is the realistic way this app hurts somebody.
//   - "What is not promised", the warranty disclaimer and the liability cap.
//   - "Which law applies", which names Ohio, where the operator is. No forum named means
//     being sued anywhere.
export default function Terms() {
  return (
    <div className="prose plate">
      <h1>Terms and acceptable use</h1>
      <p className="updated">Last updated {TERMS_UPDATED}</p>
      <p>
        Family Recipes is a place to keep your family's recipes and, if you choose, to share
        some of them. Most of what follows is one idea: publish only what is yours to publish,
        and be someone other cooks would want in their kitchen.
      </p>

      <h2>Who may use it</h2>
      <p>
        You need to be at least 13 to have an account. If you are under 18, please use it with
        a parent's knowledge. By accepting these terms you are telling us you meet that age, and
        an account we learn belongs to a younger child is deleted rather than corrected.
      </p>

      <h2>Your recipes stay yours</h2>
      <p>
        Everything you add belongs to you. Recipes are private to your family unless you
        publish them. Publishing a recipe makes it readable by anyone with the link, and lets
        other cooks save a copy into their own vault.
      </p>

      <h3>Permission to show them</h3>
      <p>
        So that the app can actually work, you give {OPERATOR} permission to store, copy, resize
        and display what you add, for the purpose of running Family Recipes and showing your
        content to the people you chose to show it to. That is all it covers. It is not a licence
        to sell your recipes, to publish a private one, to put them in a book, or to train an AI
        model on them, and none of those things happen.
      </p>
      <p>
        When you publish a recipe, you also give other cooks permission to save a copy into their
        own vault and cook from it, with your name kept on it. That permission does not expire,
        which is the honest consequence of the next paragraph.
      </p>
      <p>
        A saved copy is a real copy. If you later unpublish or delete a recipe, copies already
        saved stay in the vaults that saved them, credited to you. That is deliberate: it means
        nobody's vault can be emptied by someone else's decision. Decide with that in mind
        before you publish, because publishing is the step you cannot fully take back.
      </p>

      <h2>Cooking from what you find here</h2>
      <p>
        Recipes here are written by families, not tested in a test kitchen, and nobody checks
        them for you. The AI import is worse than a person at this, not better: it reads a photo,
        a link or a recording, and it does make mistakes, including confusing teaspoons with
        tablespoons, mangling a quantity, and leaving an ingredient out altogether.
      </p>
      <p>
        <strong>
          If you or anyone you are cooking for has a food allergy, check the ingredients against
          the original source before you cook, every time.
        </strong>{" "}
        A missing line in an imported recipe is exactly the kind of mistake this app can make,
        and it is the one that matters most. Treat every recipe here, and an imported one
        especially, as a note from a relative that you still have to read properly: use your own
        judgement on cooking temperatures, storage, preserving and raw ingredients.
      </p>
      <p>
        Nothing here is medical, dietary or food safety advice, and {OPERATOR} cannot be
        responsible for what a recipe in someone's family vault says.
      </p>

      <h2>What you may publish</h2>
      <ul>
        <li>Recipes you wrote, or your family's recipes you are entitled to share.</li>
        <li>
          Recipes adapted from a book, a site or another cook, where you say where they came
          from. Ingredients and methods are not copyrightable, but somebody's written words and
          photographs are.
        </li>
      </ul>

      <h2>What gets removed</h2>
      <p>A published recipe can be removed from the public side of the app if it is:</p>
      <ul>
        <li>not a recipe;</li>
        <li>abusive, hateful, harassing, or sexual content;</li>
        <li>somebody else's work, published without the right to do so;</li>
        <li>an attempt to pass yourself off as someone you are not;</li>
        <li>spam, advertising, or an attempt to break or misuse the app.</li>
      </ul>
      <p>
        Removal means the recipe stops being public. <strong>It stays in your vault</strong>, and
        you are told the reason on the recipe itself. An account that keeps doing this can be
        suspended from publishing, which also takes its published recipes down.
      </p>

      <h2>Reporting something</h2>
      <p>
        Every published recipe has a Report control. Reports are read by a person, not a machine,
        so allow some time. If you think something was removed wrongly, write to the address
        below and say so.
      </p>

      <h2>Copyright complaints</h2>
      <p>
        If something published here is your copyrighted work and you did not agree to it being
        posted, write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and tell us:
      </p>
      <ul>
        <li>what the work is, and a link to the recipe here that copies it;</li>
        <li>your name and a contact address;</li>
        <li>that you believe in good faith the use was not authorised;</li>
        <li>
          that what you are telling us is accurate, and that you are the rights holder or are
          authorised to act for them.
        </li>
      </ul>
      <p>
        Complaints are acted on quickly, and the person who posted it is told what was removed
        and why. If you think your recipe was taken down by mistake, reply and say so, and it
        goes back up if you are right. An account that repeatedly posts other people's work is
        suspended.
      </p>

      <h2>Payments and refunds</h2>
      <p>
        Family Recipes is free. There is nothing to buy, no subscription, no trial that turns
        into one, and the app never asks for card or bank details. Because no money changes
        hands, <strong>there is nothing to refund</strong>, and this section exists only to say
        so plainly rather than leave you guessing.
      </p>
      <p>
        If a paid feature is ever introduced, it will be opt-in, it will be priced before you
        agree to it, and these terms will be updated with a refund and cancellation policy
        before any payment is taken. You would never be charged for something you already have
        for free.
      </p>

      <h2>Your account and your data</h2>
      <p>
        You can delete your account from Settings, which removes your recipes and your profile.
        Copies other cooks saved before then remain in their vaults, for the reason given above.
      </p>
      <p>
        An account can be suspended, or closed, if it is used for the things listed under what
        gets removed, or in a way that breaks the app for other people. You are told when that
        happens, and you can challenge it at the address below.
      </p>

      <h2>What is not promised</h2>
      <p>
        Family Recipes is offered <strong>as it is</strong>. It is a personal project, not a
        product with a support contract, and there is no promise that it will be available, that
        it will not lose data, that it will keep existing, or that anything in it is accurate or
        fit for a particular purpose. All warranties that can be disclaimed are disclaimed,
        including the implied warranties of merchantability, fitness for a particular purpose and
        non-infringement. Please keep your own copy of anything you would be upset to lose.
      </p>
      <p>
        So far as the law allows, {OPERATOR} is not liable for indirect, incidental or
        consequential losses, for lost data, or for anything that follows from a recipe here
        being wrong. Where liability cannot be excluded, it is limited to one hundred US dollars
        in total, which reflects that you pay nothing for this.
      </p>
      <p>
        Two things are deliberately not limited, because limiting them would be wrong and in many
        places is not permitted anyway: death or personal injury caused by negligence, and fraud.
        Nothing here limits any right you have as a consumer that cannot be limited by agreement,
        and if you live somewhere that does not allow some of the exclusions above, those
        exclusions simply do not apply to you.
      </p>

      <h2>If you cause a problem</h2>
      <p>
        If somebody brings a claim against {OPERATOR} because of what you published, for instance
        because you posted work that was not yours to post, you agree to cover the reasonable
        cost of dealing with it. This is not here to catch out an honest mistake with a
        misattributed recipe: it is here for the case where someone uses this app to publish
        something they knew they had no right to.
      </p>

      <h2>Who you are agreeing with</h2>
      <p>
        Family Recipes is run by {OPERATOR}, a private individual in Ohio, in the United States,
        rather than a company. It is a personal project offered as it is, with no guarantee that
        it will be available forever.
      </p>
      <p>
        What happens to your personal data is a separate document, because it is a separate
        promise: see the <Link to="/privacy">privacy policy</Link>. It also tells you the thing
        most worth knowing before you use the AI import: which companies your recipe text, photo
        or recording is sent to.
      </p>

      <h2>Which law applies</h2>
      <p>
        These terms are governed by the law of the State of Ohio, in the United States, and a
        dispute belongs in the state or federal courts for Franklin County, Ohio. There is no
        forced arbitration here and no class action waiver: if we fall out, a court is fine.
      </p>
      <p>
        If you live outside the United States, that choice does not take away a protection your
        own country's consumer law gives you. If you are in the UK or the EU, the privacy policy
        explains your data protection rights and how to complain to a regulator, and this section
        does not affect them.
      </p>

      <h2>If these terms change</h2>
      <p>
        When the wording here changes in a way that matters, the date at the top changes and you
        are asked to read and accept the terms again the next time you sign in. Carrying on using
        the app after that is how you accept them.
      </p>

      <h2>Contact</h2>
      <p>
        A person reads <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Use it for
        reports, complaints, copyright notices, takedown requests, or anything about your own
        data.
      </p>
    </div>
  );
}
