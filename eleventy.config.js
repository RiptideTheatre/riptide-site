module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });
  eleventyConfig.addPassthroughCopy({ "src/_redirects": "_redirects" });
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

  eleventyConfig.addFilter("bookingUrl", (show) => {
    if (show.ctaUrl) return show.ctaUrl;
    if (show.status === "on-sale" && show.ticketUrl) return show.ticketUrl;
    return "/#newsletter";
  });

  eleventyConfig.addFilter("byYearDesc", (arr) =>
    [...arr].sort((a, b) => (Number(b.data.year) || 0) - (Number(a.data.year) || 0) || (a.data.order || 99) - (b.data.order || 99))
  );
  eleventyConfig.addFilter("isFilled", (v) => !!v && !/^\s*\[/.test(String(v)));
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
