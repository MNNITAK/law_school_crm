import fs from "node:fs";
import path from "node:path";
import SiteRuntime from "@/components/site/SiteRuntime";

// The approved single-file design is kept verbatim as HTML (see components/site/body.html)
// so the trial build is pixel-identical to what the client signed off on.
// All behaviour (menus, eligibility, Aria, apply form) is attached by <SiteRuntime />.
export default function Home() {
  const bodyHtml = fs.readFileSync(
    path.join(process.cwd(), "components", "site", "body.html"),
    "utf8"
  );
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      <SiteRuntime />
    </>
  );
}
