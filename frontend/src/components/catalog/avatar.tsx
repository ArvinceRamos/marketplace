import Image from "next/image";

/** Round avatar; falls back to the first letter of the name. */
export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url: string | null;
  size?: 40 | 64;
}) {
  const box = size === 64 ? "size-16 text-heading" : "size-10 text-small";
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-800 ${box}`}
      aria-hidden
    >
      {url ? <Image src={url} alt="" fill sizes={`${size}px`} /> : name.charAt(0).toUpperCase()}
    </span>
  );
}
