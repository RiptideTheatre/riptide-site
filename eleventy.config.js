module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });
  eleventyConfig.addPassthroughCopy({ "src/_redirects": "_redirects" });
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers", "src/favicon.svg": "favicon.svg", "src/favicon.ico": "favicon.ico" });
  eleventyConfig.addPassthroughCopy({ "src/sonder/media/audio": "sonder/media/audio", "src/sonder/media/photos": "sonder/media/photos" });
  // Reset members area: plain files, guarded by functions/reset/members/_middleware.js
  eleventyConfig.addPassthroughCopy({ "reset-members": "reset/members" });

  // Status drives the badge and the call to action on every listing.
  // Change a show's `status` in the CMS and the whole site follows.
  const STATUS = {
    "on-sale": { label: "On sale", tone: "live", cta: "Book tickets" },
    "coming-soon": { label: "Coming soon", tone: "soon", cta: "Join the waiting list" },
    anytime: { label: "Anytime", tone: "open", cta: "Start now" },
    podcast: { label: "Podcast", tone: "quiet", cta: "Listen" },
    touring: { label: "Available to tour", tone: "open", cta: "Enquire" },
    past: { label: "Past work", tone: "quiet", cta: "Read more" }
  };

  // Project Intimacy runs: one list in the show's settings feeds the page and the questionnaire
  const asDate = (d) => (d instanceof Date ? d : new Date(String(d) + "T12:00:00Z"));
  const ord = (n) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
  const M = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const W = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  eleventyConfig.addFilter("runIso", (d) => asDate(d).toISOString().slice(0, 10));
  eleventyConfig.addFilter("runStartLabel", (d) => { const x = asDate(d); return `${W[x.getUTCDay()]} ${ord(x.getUTCDate())} ${M[x.getUTCMonth()]}`; });
  eleventyConfig.addFilter("runRange", (r) => {
    const a = asDate(r.start), b = asDate(r.end || r.start);
    const y = a.getUTCFullYear() !== b.getUTCFullYear();
    if (a.getUTCMonth() === b.getUTCMonth() && !y) return `${a.getUTCDate()}–${b.getUTCDate()} ${M[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
    return `${a.getUTCDate()} ${M[a.getUTCMonth()]}${y ? " " + a.getUTCFullYear() : ""} – ${b.getUTCDate()} ${M[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  });
  eleventyConfig.addFilter("currentRuns", (runs) => {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    return (runs || []).filter((r) => asDate(r.end || r.start) >= today).sort((p, q) => asDate(p.start) - asDate(q.start));
  });
  eleventyConfig.addFilter("statusLabel", (s) => (STATUS[s] || STATUS.past).label);
  eleventyConfig.addFilter("statusTone", (s) => (STATUS[s] || STATUS.past).tone);
  eleventyConfig.addFilter("statusCta", (s) => (STATUS[s] || STATUS.past).cta);

  // Where a show's "Book tickets" goes: its ticket link, a section on its own page (#book), or its page.
  eleventyConfig.addFilter("bookHref", (data, url) => {
    if (data.ticketUrl) return data.ticketUrl;
    if (data.ctaUrl && data.ctaUrl !== "#") return data.ctaUrl[0] === "#" ? url + data.ctaUrl : data.ctaUrl;
    return url;
  });

  eleventyConfig.addFilter("bookingUrl", (show) => {
    if (show.ctaUrl) return show.ctaUrl;
    if (show.status === "on-sale" && show.ticketUrl) return show.ticketUrl;
    return "/#newsletter";
  });

  eleventyConfig.addFilter("byYearDesc", (arr) =>
    [...arr].sort((a, b) => (Number(b.data.year) || 0) - (Number(a.data.year) || 0) || (a.data.order || 99) - (b.data.order || 99))
  );

  // Offer WebP (and a phone-sized copy) for every site photo. tools/images.py makes the files;
  // this swaps <img src="x.jpg"> for a <picture>, keeping the original as the fallback.
  const imgWidths = (() => { try { return require("./tools/image-widths.json"); } catch { return {}; } })();
  const fsImg = require("fs");
  eleventyConfig.addTransform("webp-pictures", function (content) {
    if (!(this.page.outputPath || "").endsWith(".html")) return content;
    return content.replace(/<img\b([^>]*?)\ssrc="(\/assets\/(?:img|img\/partners|video)\/[^"?]+?)\.(jpe?g|png)"([^>]*)>/g, (tag, before, base, ext, after) => {
      if (/srcset=/.test(tag)) return tag;
      if (!fsImg.existsSync("src" + base + ".webp")) return tag;
      const w = imgWidths[base];
      const variants = [480, 800].filter((n) => fsImg.existsSync("src" + base + "-" + n + ".webp")).map((n) => `${base}-${n}.webp ${n}w`);
      const sizesM = tag.match(/\ssizes="([^"]*)"/);
      const srcset = variants.length && w ? variants.concat(`${base}.webp ${w}w`).join(", ") : `${base}.webp`;
      const sizes = variants.length && w ? ` sizes="${sizesM ? sizesM[1] : "(max-width: 860px) 100vw, 50vw"}"` : "";
      let img = tag;
      if (!/\sdecoding=/.test(img)) img = img.replace(/<img\b/, '<img decoding="async"');
      return `<picture><source type="image/webp" srcset="${srcset}"${sizes}>${img}</picture>`;
    });
  });
  // Minify the stylesheets after each build (the source files stay readable).
  eleventyConfig.on("eleventy.after", ({ dir }) => {
    const { transform } = require("lightningcss");
    const path = require("path");
    const cssDir = path.join(dir.output, "assets", "css");
    if (!fsImg.existsSync(cssDir)) return;
    for (const f of fsImg.readdirSync(cssDir).filter((n) => n.endsWith(".css"))) {
      const file = path.join(cssDir, f);
      try {
        const out = transform({ filename: f, code: fsImg.readFileSync(file), minify: true, targets: { safari: 14 << 16, chrome: 90 << 16, firefox: 90 << 16 } });
        fsImg.writeFileSync(file, out.code);
      } catch (e) { console.warn("[css] could not minify", f, e.message); }
    }
  });

  // A small WebP copy of an image, for blurred backgrounds (falls back to the original)
  eleventyConfig.addFilter("smallWebp", (src) => {
    const m = String(src || "").match(/^(\/assets\/.+)\.(jpe?g|png)$/);
    if (!m) return src;
    for (const n of [480, 800]) if (fsImg.existsSync("src" + m[1] + "-" + n + ".webp")) return m[1] + "-" + n + ".webp";
    return fsImg.existsSync("src" + m[1] + ".webp") ? m[1] + ".webp" : src;
  });
  eleventyConfig.addFilter("isFilled", (v) => !!v && !/^\s*\[/.test(String(v)));
  // keep only list items whose given field is real copy, not a [PLACEHOLDER]
  eleventyConfig.addFilter("filledBy", (arr, key) => (arr || []).filter((x) => !!x && !!x[key] && !/^\s*\[/.test(String(x[key]))));
  eleventyConfig.addFilter("bySortOrder", (arr) =>
    [...arr].sort((a, b) => (a.data.order || 99) - (b.data.order || 99))
  );

  eleventyConfig.addCollection("current", (api) =>
    api
      .getFilteredByTag("show")
      .filter((s) => s.data.status !== "past" && !s.data.hidden)
      .sort((a, b) => (a.data.order || 99) - (b.data.order || 99))
  );

  eleventyConfig.addCollection("past", (api) =>
    api
      .getFilteredByTag("show")
      .filter((s) => s.data.status === "past" && !s.data.hidden)
      .sort((a, b) => (b.data.year || 0) - (a.data.year || 0))
  );

  eleventyConfig.addCollection("featured", (api) =>
    api
      .getFilteredByTag("show")
      .filter((s) => s.data.featured && !s.data.hidden)
      .sort((a, b) => (a.data.order || 99) - (b.data.order || 99))
  );

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
