# Resume notes

Files:

- `resume.html` is the source of truth. Edit it, then rebuild the PDF:
  ```bash
  chromium --headless --no-pdf-header-footer --print-to-pdf=Mohammad_Ghaffary_Resume.pdf resume.html
  ```
  (or open it in Chrome and use Print → Save as PDF, margins "Default", headers/footers off).
- `Mohammad_Ghaffary_Resume.pdf` is the version to send (one page, A4).

## What changed compared with the previous resume

| Before | After | Why |
| --- | --- | --- |
| Headline "Senior Software Engineer", generic | "Senior Backend Engineer · Python · Distributed Systems" | Matches the job titles you are applying for, which helps both recruiters and ATS keyword search. |
| Summary said "currently contributing" to Nobitex | Past tense; Nobitex ended May 2026 | The old wording contradicted the dates. |
| "7+ years" | "8 years" (Jun 2018 – 2026) | Matches your dates. |
| "the largest exchange in the country" | "Iran's largest cryptocurrency exchange" | European recruiters do not know which country is meant. |
| No location or relocation line | "Tehran, Iran · Open to relocation to Europe (EU Blue Card / work visa)" | Recruiters filter on this first. Saying it upfront avoids silent rejections. |
| GitHub link pointed to `interview_backend` | `github.com/sheracore` | Your profile shows QueueLess. |
| Flat skills list | Grouped skills, adding FastAPI, Kafka, Kubernetes, microservices, SQLAlchemy and Pydantic | Easier to scan, with the skills you asked to add. |
| No current role | QueueLess listed as a freelance role (2026 – Present) | Covers the gap after May 2026 and shows FastAPI, Kafka and microservices. |
| Bullets started with weak verbs and ended without a result | Each bullet has an action and an outcome, and numbers are in bold | Recruiters skim the numbers first. |
| "Fine-tuned SQL queries to speed up execution time" | Merged with the "reduced database hits by 50%" claim from your old summary | The claim now sits on the job where it happened. |
| No Tech line per job | A Tech line under each job | ATS keyword matching, and it shows where each skill was used. |

## Things to check before you send it (please verify, I could not)

1. **QueueLess dates.** I wrote "2026 – Present". Put the real start month (for example "Jun 2026 – Present").
   If anyone asks, describe it honestly as a freelance or independent product you are building. The repository is public,
   and interviewers will open it.
2. **Kubernetes.** You said to treat it as a skill you have. It appears in Summary and Skills, and QueueLess says it is
   "ready for Kubernetes deployment". To back that up, add `k8s/` manifests (Deployment, Service, ConfigMap, probes on
   `/health`) or a Helm chart to the QueueLess repo. That is a small task, and it turns a claim into evidence.
3. **Gemini at Learnwise.** Your old resume said you integrated Gemini AI at Learnwise (Jul 2022 – Aug 2023). Gemini was released in
   December 2023, after that job ended, and an interviewer may notice. I changed it to "LLM-generated content". If that
   work happened later (for example as freelance or with Formaloo), move the bullet to the right place.
4. **Languages.** I added "English: professional working proficiency". If you have an IELTS or TOEFL score, add it, for
   example "English: C1 (IELTS 7.0)". Any German or Dutch, even A1, is worth listing for those countries.
5. **Degree dates.** Add the graduation year for the M.Sc. Add your B.Sc. too if you have one. For the
   German Blue Card, check that K. N. Toosi University is listed as "H+" in
   [anabin](https://anabin.kmk.org). If it is not, get a ZAB Statement of Comparability.
6. **Phone number.** Optional, but many European recruiters expect one. A WhatsApp-reachable number is fine.
7. **Photo, date of birth, marital status.** Leave them out for the Netherlands, Ireland, the UK and the Nordics. For Germany a photo is
   optional and not required.

## LinkedIn

- Headline: `Senior Backend Engineer | Python, Django, FastAPI | Kafka, Microservices, Kubernetes | Open to relocation (EU)`
- In *Open to work*, set the locations to Germany, Netherlands, Ireland, Sweden, Denmark, Poland, Portugal and Spain, set the visibility to
  "Recruiters only", and add the job titles "Backend Engineer", "Senior Python Developer", "Platform Engineer" and "Software Engineer".
- Copy the Experience bullets from this resume into LinkedIn so both tell the same story.
- Add QueueLess under *Featured*.
