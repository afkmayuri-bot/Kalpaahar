# KalpAahar Website

Site for Dr. Sayali Nahar's nutrition coaching business.

## Structure
```
index.html      → markup only
css/style.css   → all styling
js/script.js    → all interactivity (nav, theme toggle, ebook modals, Razorpay checkout)
images/         → logo, hero, ebook covers, award photos
ebooks/         → the 6 paid ebook PDFs + 1 free bonus PDF (see below)
README.md
```

## Before deploying: add the real ebook PDFs
The `ebooks/` folder currently has placeholder `.txt` markers, not real PDFs.
Replace each with the actual file, using these exact names (the code
references them directly):

- `High-Protein-Breakfast.pdf`
- `Picky-Eaters.pdf`
- `Gut-Health-Reset.pdf`
- `Snack-Smart.pdf`
- `Power-Lunch.pdf`
- `Ancient-Grain-Modern-Plate.pdf`
- `Move-Well-Home-Workout-Guide.pdf` (free bonus, included with every purchase)

Delete the `.placeholder.txt` files once the real PDFs are in place.

## Deploy
Upload all files/folders to your repo root, keeping structure intact.
Works as-is with GitHub Pages or Cloudflare Pages — no build step needed.

No custom domain is configured, so no `CNAME` file is included. If you add
one later, create a file named `CNAME` (no extension) at the repo root
containing just your domain, e.g.:
```
www.kalpaahar.com
```

## Notes
- Images were extracted from base64 (previously embedded in one ~12MB file)
  into `/images` as normal linked files — same look, much smaller repo.
- CSS and JS were split out of the markup into their own folders for easier
  editing and browser caching.
