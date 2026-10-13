import type { Metadata } from "next";
import { InfoIntro, InfoList, InfoSection, InfoText } from "@/components/info-page";
import { Page } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/text-link";

export const metadata: Metadata = {
  title: "Terms of use · Marketplace",
  description: "The rules for using Marketplace to buy and sell items.",
};

export default function TermsPage() {
  return (
    <Page title="Terms of use" width="prose">
      <InfoIntro updated="13 October 2026">
        By creating an account or using Marketplace, you agree to these terms. They are written in
        plain language and are not legal advice.
      </InfoIntro>

      <InfoSection id="service" title="What Marketplace is">
        <InfoText>
          Marketplace is a free, non-commercial place to list items and talk with buyers and sellers in
          the Philippines. We are not a party to any sale. We do not handle payments or deliveries, check
          items, or guarantee that a listing is true.
        </InfoText>
      </InfoSection>

      <InfoSection id="account" title="Your account">
        <InfoList>
          <li>You must be 18 or older.</li>
          <li>Give true information, and use one account per person.</li>
          <li>Keep your password secret. You are responsible for what happens in your account.</li>
          <li>
            You can delete your account at any time in <TextLink href="/settings">Settings</TextLink>.
          </li>
        </InfoList>
      </InfoSection>

      <InfoSection id="listings" title="Listing items">
        <InfoList>
          <li>Only list items you own and can legally sell.</li>
          <li>Describe the item and its condition honestly, and use your own photos.</li>
          <li>Pick the right category, and mark items as sold when they are gone.</li>
          <li>
            Do not list anything on the{" "}
            <TextLink href="/safety#prohibited">list of items you cannot sell</TextLink>.
          </li>
        </InfoList>
      </InfoSection>

      <InfoSection id="conduct" title="How to behave">
        <InfoList>
          <li>Be respectful. No harassment, hate speech, threats, or spam.</li>
          <li>Do not scam, mislead, or pretend to be someone else.</li>
          <li>Do not share other people&apos;s personal data without their consent.</li>
          <li>Do not try to break, overload, or get around the site&apos;s security or limits.</li>
        </InfoList>
      </InfoSection>

      <InfoSection id="content" title="Your content">
        <InfoText>
          You keep ownership of the photos and text you post. You let us store and show them on
          Marketplace so the service works. You must have the right to post them.
        </InfoText>
      </InfoSection>

      <InfoSection id="enforcement" title="When rules are broken">
        <InfoText>
          We may remove listings or messages, limit features, or close accounts that break these
          terms or the law. You can report listings and people, and block anyone you do not want to
          hear from. See <TextLink href="/safety">Safety tips</TextLink>.
        </InfoText>
      </InfoSection>

      <InfoSection id="liability" title="No guarantees">
        <InfoText>
          Marketplace is provided &ldquo;as is&rdquo;. It may be slow, change, or stop working. Deals are
          between buyers and sellers, and we are not responsible for the items, payments, or meetups.
          This does not remove any rights you have under Philippine law.
        </InfoText>
      </InfoSection>

      <InfoSection id="privacy" title="Privacy and changes">
        <InfoText>
          How we use your data is explained in the{" "}
          <TextLink href="/privacy">Privacy notice</TextLink>. If these terms change, we will update the
          date at the top. These terms follow the laws of the Philippines.
        </InfoText>
      </InfoSection>
    </Page>
  );
}
