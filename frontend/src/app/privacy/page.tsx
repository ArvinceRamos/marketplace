import type { Metadata } from "next";
import { InfoIntro, InfoList, InfoSection, InfoText } from "@/components/info-page";
import { Page } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/text-link";

export const metadata: Metadata = {
  title: "Privacy notice · Marketplace",
  description: "What personal data Marketplace collects, why, and how you can see, fix, or delete it.",
};

export default function PrivacyPage() {
  return (
    <Page title="Privacy notice" width="prose">
      <InfoIntro updated="13 October 2026">
        This notice explains what we collect and why, in plain language. We follow the Philippine
        Data Privacy Act of 2012 (Republic Act No. 10173). This page is not legal advice.
      </InfoIntro>

      <InfoSection id="collect" title="What we collect">
        <InfoList>
          <li>
            <strong className="font-semibold">Account:</strong> your email address, your password
            (stored only in scrambled form by our login provider), and that you confirmed you are 18
            or older.
          </li>
          <li>
            <strong className="font-semibold">Profile:</strong> your username, and if you add them,
            a display name, a short bio, a photo, and your city. We never ask for your exact address.
          </li>
          <li>
            <strong className="font-semibold">What you post:</strong> listings, photos, chat messages,
            offers, saved items, reports, the people you block, and the sellers you follow.
          </li>
          <li>
            <strong className="font-semibold">Technical data:</strong> sign-in cookies, and your IP
            address, used for a short time to stop abuse (for example, too many searches).
          </li>
        </InfoList>
        <InfoText>
          We remove hidden data from photos, such as GPS location, when you upload them. We do not use
          ads or tracking cookies.
        </InfoText>
      </InfoSection>

      <InfoSection id="why" title="Why we use it">
        <InfoList>
          <li>To create your account and keep you signed in</li>
          <li>To show your listings and profile to other people</li>
          <li>To deliver chat messages and offers between buyers and sellers</li>
          <li>To keep the site safe: rate limits, reports, and blocks</li>
        </InfoList>
        <InfoText>We do not sell your data or share it for advertising.</InfoText>
      </InfoSection>

      <InfoSection id="public" title="What other people can see">
        <InfoText>
          Anyone can see your username, display name, bio, photo, city, join date, number of
          followers, and your listings (except drafts). Who you follow, and who follows you, is not
          shown. Your email address is never shown. Chats and offers are only visible to the two
          people in them.
        </InfoText>
      </InfoSection>

      <InfoSection id="providers" title="Who helps us run the site">
        <InfoText>
          Our database, login, and photo storage run on Supabase. Our website and server run on
          hosting providers (Vercel and Render). They process data only to run the service. Their
          servers may be outside the Philippines.
        </InfoText>
      </InfoSection>

      <InfoSection id="keep" title="How long we keep it">
        <InfoText>
          We keep your data while your account is open. When you delete your account, we delete your
          profile, photos, listings (and the chats about them), saved items, blocks, follows, and your reports.
          Messages you sent in other people&apos;s listings stay in their chat, shown as from a
          &ldquo;Deleted user&rdquo;. Hosting providers keep server logs for a short time.
        </InfoText>
      </InfoSection>

      <InfoSection id="rights" title="Your rights">
        <InfoText>Under the Data Privacy Act you have the right to:</InfoText>
        <InfoList>
          <li>Be informed about how your data is used (this page)</li>
          <li>
            See and correct your data: <TextLink href="/profile">your profile</TextLink> and{" "}
            <TextLink href="/my-listings">your listings</TextLink>
          </li>
          <li>
            Delete your data: <strong className="font-semibold">Delete account</strong> in{" "}
            <TextLink href="/settings">Settings</TextLink>
          </li>
          <li>Object to processing, and get a copy of your data</li>
          <li>File a complaint with the National Privacy Commission (privacy.gov.ph)</li>
        </InfoList>
      </InfoSection>

      <InfoSection id="security" title="How we protect it">
        <InfoText>
          Connections are encrypted. Each person can only change their own data, and the database
          checks this again on every request. Only a few people who run the site can reach the servers.
          No system is perfectly secure, so use a strong password you do not use anywhere else.
        </InfoText>
      </InfoSection>

      <InfoSection id="changes" title="Changes and questions">
        <InfoText>
          Marketplace is a non-commercial project in development. If this notice changes, we will
          update the date at the top. A contact address for privacy questions will be added here
          before public launch.
        </InfoText>
      </InfoSection>
    </Page>
  );
}
