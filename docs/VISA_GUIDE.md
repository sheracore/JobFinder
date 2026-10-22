# European work-visa routes for software engineers

A practical overview for a non-EU senior backend engineer. Thresholds change every year, so **check the official
link before relying on a number.** The figures below are the ones I know of as of 2026.

## Where to focus

| Country | Route | Why it is a good target | Official source |
| --- | --- | --- | --- |
| 🇩🇪 Germany | **EU Blue Card** | The largest tech job market in the EU. IT is a shortage occupation, so the salary threshold is lower (2026: about €45.9k gross a year; general threshold about €50.7k). IT specialists can qualify without a degree if they have 3+ years of experience. The employer does not need a sponsor licence: any company can hire you. The *accelerated skilled-worker procedure* (§81a AufenthG) speeds up the embassy appointment. | [make-it-in-germany.com](https://www.make-it-in-germany.com/en/visa-residence/types/eu-blue-card) |
| 🇳🇱 Netherlands | **Highly Skilled Migrant (kennismigrant)** | Fast: the IND often decides in 2–4 weeks. Most tech jobs in Amsterdam are in English. The employer **must be an IND recognised sponsor**, and `jobfinder sponsors` downloads that register. The 30% ruling (a tax benefit) may apply. Monthly salary threshold for 30+ is around €5.9k in 2026. | [ind.nl](https://ind.nl/en/residence-permits/work/highly-skilled-migrant) |
| 🇮🇪 Ireland | **Critical Skills Employment Permit** | Software engineers are on the critical skills list. Applies from €38k with a relevant degree, and family can join right away. A hub for big tech EMEA offices. | [enterprise.gov.ie](https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/permit-types/critical-skills-employment-permit/) |
| 🇸🇪 Sweden / 🇩🇰 Denmark / 🇫🇮 Finland | National work permits, Danish Fast-Track, Finnish Specialist permit | English-speaking engineering cultures and many startups that sponsor. Denmark's Fast-Track scheme works through certified companies. | migrationsverket.se · nyidanmark.dk · migri.fi |
| 🇦🇹 Austria, 🇱🇺 Luxembourg, 🇧🇪 Belgium | EU Blue Card / Red-White-Red Card | Smaller markets with less competition. | — |
| 🇵🇹 Portugal, 🇪🇸 Spain, 🇵🇱 Poland, 🇪🇪 Estonia | EU Blue Card or national highly-qualified routes | Lower salaries, but processes are relatively easy, and Estonia runs digital-first immigration. | — |
| 🇬🇧 United Kingdom | **Skilled Worker visa** | Not in the EU, but a big market. The employer must hold a sponsor licence (also checked by `jobfinder`). | [gov.uk](https://www.gov.uk/skilled-worker-visa) |

## Keeping Iranian citizenship, and moving on to the US later

Iran does not let its citizens give up Iranian citizenship in practice, and it treats you only as Iranian
inside Iran, so you always enter Iran on your Iranian passport. What matters is whether the *new* country
makes you renounce. `config.yaml` (`search.countries`) only lists countries where you can keep both.

| Allowed: you keep both | Not allowed or unclear: excluded from the search |
| --- | --- |
| Germany (5 years), Canada (3 of 5 years), Ireland (5), Belgium (5), Luxembourg (5), France (5), UK (about 6), Sweden (8, since June 2026), Finland (8), Norway (8), Poland (about 8), Denmark (9), Czechia (about 10), Iceland (7), Switzerland (10), Greece (7), Malta, Cyprus, Italy (10), Portugal (10, since May 2026), Hungary, Romania (8) | Austria, Estonia, Latvia, Lithuania, Spain, Slovakia, Slovenia, Croatia, Bulgaria, Serbia |

The years are roughly how long you must live there before applying, and they keep changing. The
**Netherlands** normally requires renouncing, but Iranians are usually exempt because Iranian law does not
allow it. That comes from lawyers' summaries, not an official IND statement, so confirm it with the IND
before counting on it.

**Moving to the US afterwards.** The US travel ban in force since January 2026 fully suspends visas for Iranian
nationals, but it exempts dual nationals who travel on a passport from a country that is not on the list. So a
German, Canadian or other EU passport is what opens US visas again. Two limits remain:

- You still need a US visa. Dual Iranian nationals cannot use the Visa Waiver Program (ESTA), even with an EU
  passport.
- A USCIS policy memo puts holds on immigration applications (such as green cards) from nationals of listed
  countries, and reports say it does not clearly exempt dual nationals.

**Canada is the strongest stepping stone.** After Canadian citizenship (3 years of residence out of 5), you can work
in the US on a **TN visa**, which only Canadian and Mexican citizens can get. Software roles often qualify
under the "Computer Systems Analyst" category. Canada's main route is **Express Entry** permanent residence,
which you apply for yourself, without an employer sponsor. A high IELTS score matters a lot. A job offer helps
less than it used to, because job-offer points were removed in 2025. Postings that mention **LMIA** or the
**Global Talent Stream** mean the employer can sponsor a work permit, and JobFinder marks them as sponsored.

US rules change often. Check the current State Department guidance, or ask an immigration lawyer, before you
plan around them.

## Things that matter for an Iranian applicant

- **Sanctions compliance.** Some US-headquartered companies, and some payment or crypto companies, cannot hire Iranian
  nationals even in their EU offices. EU-headquartered companies (German, Dutch, Nordic) are usually a safer bet. If a
  company does US-sanctioned business, ask the recruiter early.
- **Degree recognition (Germany).** Check that K. N. Toosi University of Technology is rated **H+** in
  [anabin](https://anabin.kmk.org) and that your degree is listed. If it is not, apply for a *ZAB Statement of
  Comparability*, which takes several weeks, so start now.
- **Embassy wait times.** Appointments at European embassies in Tehran can take months. Germany's accelerated
  procedure (the employer starts it at the local foreigners' office) and the Dutch IND route (the employer files, then you collect an MVV)
  are the fastest options. Ask employers whether they use a relocation agency, because many do.
- **Crypto experience.** Nobitex is a strong signal for fintech, crypto and payments companies in Berlin, Amsterdam, Lisbon and
  Zug. Expect compliance teams to ask questions, and answer them plainly.

## How to use JobFinder for this

1. `jobfinder sponsors`, then `jobfinder search`.
2. Start with jobs marked **Visa sponsored** in Germany and the Netherlands. Next come **Known sponsor** jobs in the Netherlands
   (the company already sponsors and just did not mention it). Then **Relocation support**.
3. For **Not mentioned** jobs at companies you like, ask the recruiter directly: *"I'm based in Iran and would need
   EU Blue Card sponsorship. Is that possible for this role?"* Many companies sponsor without saying so.
4. Add companies you discover to `config.yaml` (Greenhouse, Lever or Ashby slug) so they are checked every day.

## Other places worth checking by hand

- [relocate.me](https://relocate.me): only jobs with relocation packages, many in Germany and the Netherlands.
- [Arbeitnow](https://www.arbeitnow.com/?visa_sponsorship=true): already a JobFinder source.
- LinkedIn search: `"visa sponsorship" (python OR django)` with the location set to a country and *Past week*.
- [Landing.jobs](https://landing.jobs) (Portugal and Europe) and [Berlin Startup Jobs](https://berlinstartupjobs.com).
- [Hacker News "Who is hiring?"](https://news.ycombinator.com/submitted?id=whoishiring): already a JobFinder source.
