import type { Metadata } from "next";
import { InfoIntro, InfoList, InfoSection, InfoText } from "@/components/info-page";
import { Page } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/text-link";

export const metadata: Metadata = {
  title: "Safety tips · Marketplace",
  description: "How to buy and sell safely, spot scams, and what you cannot sell on Marketplace.",
};

export default function SafetyPage() {
  return (
    <Page title="Safety tips" width="prose">
      <InfoIntro updated="13 October 2026">
        Marketplace connects buyers and sellers. We do not handle real payments or deliveries, and
        we cannot get your money back. These tips help you stay safe.
      </InfoIntro>

      <InfoSection id="payments" title="Payments happen outside the app">
        <InfoList>
          <li>
            The Buy button and MockPay are a <strong>test-mode demo</strong>: no real money moves,
            and they never ask for card or bank details. Anyone asking you for those is a scammer.
          </li>
          <li>Marketplace never asks you to pay through an outside link, and never holds real money for you.</li>
          <li>Never share a one-time PIN (OTP), your bank or e-wallet password, or your card details.</li>
          <li>
            Check that money has arrived in your own bank or e-wallet app. Screenshots of a
            &ldquo;successful transfer&rdquo; can be fake.
          </li>
          <li>Be careful with deposits or &ldquo;reservation fees&rdquo; before you have seen the item.</li>
        </InfoList>
      </InfoSection>

      <InfoSection id="meetups" title="Meeting in person">
        <InfoList>
          <li>Meet in a busy public place in daylight, such as a mall or near a police station.</li>
          <li>Bring a friend if you can, and tell someone where you are going.</li>
          <li>Check the item fully before you pay. Test gadgets and check serial numbers.</li>
          <li>Keep the conversation in the Marketplace chat, so there is a record.</li>
        </InfoList>
      </InfoSection>

      <InfoSection id="scams" title="Common scams">
        <InfoList>
          <li>
            <strong className="font-semibold">Fake payment links.</strong> A &ldquo;buyer&rdquo; sends
            a link to &ldquo;receive your payment&rdquo;. It asks for your login or OTP. Do not open it.
          </li>
          <li>
            <strong className="font-semibold">Overpayment.</strong> Someone pays too much and asks you
            to send back the difference. The first payment often bounces or is reversed.
          </li>
          <li>
            <strong className="font-semibold">Fake courier.</strong> A buyer insists on their own
            courier and asks you to pay a &ldquo;delivery fee&rdquo; first.
          </li>
          <li>
            <strong className="font-semibold">Too good to be true.</strong> A very low price on a new
            phone, with pressure to pay a deposit today.
          </li>
          <li>
            <strong className="font-semibold">Moving off the app.</strong> Someone asks to continue on
            another app right away, before you have talked about the item.
          </li>
        </InfoList>
      </InfoSection>

      <InfoSection id="report" title="Report and block">
        <InfoText>
          Use <strong className="font-semibold">Report this listing</strong> on any listing, or the
          &ldquo;•••&rdquo; menu on a seller page or chat to report or block a person. Blocked people
          cannot message you or make offers. You can see your reports and unblock people in{" "}
          <TextLink href="/settings">Settings</TextLink>.
        </InfoText>
        <InfoText>
          If you are in danger, call 911. If you were scammed, keep the chat and payment records and
          report it to the PNP Anti-Cybercrime Group or the Cybercrime Investigation and Coordinating
          Center (CICC).
        </InfoText>
      </InfoSection>

      <InfoSection id="prohibited" title="Items you cannot sell">
        <InfoText>Listings with these items will be removed, and the account may be closed:</InfoText>
        <InfoList>
          <li>Illegal drugs, and anything made for using them</li>
          <li>Guns, ammunition, explosives, gun parts, and other weapons</li>
          <li>Medicines, medical devices, and other health products that need a prescription or FDA approval</li>
          <li>Alcohol, tobacco, vapes, and e-cigarettes</li>
          <li>Counterfeit, replica, or &ldquo;class A&rdquo; copies of branded goods</li>
          <li>Stolen goods, or items you do not own</li>
          <li>Live animals, wildlife, and animal parts from protected species</li>
          <li>Adult content and sexual services</li>
          <li>Government IDs, documents, licenses, and plates</li>
          <li>Registered SIM cards, social media or game accounts, and other people&apos;s personal data</li>
          <li>Money, gift cards sold for profit, investment schemes, and gambling</li>
          <li>Hazardous chemicals and recalled products</li>
          <li>Anything else that is illegal to sell in the Philippines</li>
        </InfoList>
        <InfoText>
          See also the <TextLink href="/terms">Terms of use</TextLink>.
        </InfoText>
      </InfoSection>
    </Page>
  );
}
