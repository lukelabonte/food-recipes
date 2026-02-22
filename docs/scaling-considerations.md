# Scaling Considerations

Things to address if this project grows to many contributors or a large recipe collection. Update this doc as new scaling concerns are discovered during development.

## Photo Storage Migration (Git → R2/CDN)

**When to consider:** Repo size exceeds ~50MB from photos, or clone times become noticeable.

**What to do:**
- Create a Cloudflare R2 bucket for recipe photos
- Set up a custom domain (e.g., `photos.copyandpastry.com`)
- Migrate existing photos from `assets/photos/` to R2
- Update photo base URL in one place (design abstracts this)
- Update deploy workflow to skip committing photos to git
- Consider R2 lifecycle policies for unused/replaced images

## Automated Photo Generation in Upload Pipeline

**When to consider:** Contributors are regularly submitting recipes without photos.

**What to do:**
- Add an image generation API key to the Worker (e.g., DALL-E, Flux, or Anthropic image generation)
- After recipe JSON extraction, generate a food photo from the title + description
- If a source image was uploaded, evaluate quality — use directly if clean, use as reference for generation if cluttered
- Commit generated photo alongside recipe HTML in the PR
- Consider cost per generation and rate limiting

## Responsive Images (Multiple Sizes)

**When to consider:** Mobile performance data shows large images are a bottleneck, or recipe count exceeds ~50.

**What to do:**
- Generate multiple sizes per photo (e.g., 400w, 800w, 1200w)
- Use `<img srcset="...">` for recipe page heroes
- Use appropriately sized versions for index card backgrounds
- Add image optimization step to deploy workflow
- Consider lazy loading for below-the-fold index cards

## Upload Form Image Handling

**When to consider:** When automated photo generation is added to the pipeline.

**What to do:**
- Wire the existing image upload field in `upload.html` to the Worker
- Worker evaluates source image quality (has UI overlays? aspect ratio? resolution?)
- Clean images: resize, convert to WebP, commit directly
- Cluttered images: store as reference, generate clean version via AI
- Add image preview to the upload form UI

## Index Page Performance

**When to consider:** Recipe count exceeds ~30-40 with background images.

**What to do:**
- Implement intersection observer for lazy-loading card background images
- Consider thumbnail-sized versions (~200px wide) for index cards vs full-size for recipe pages
- Measure Core Web Vitals (LCP, CLS) impact of background images
- Consider CSS `content-visibility: auto` for off-screen category sections

## Shopping List Photos

**When to consider:** As a UX polish after core photo feature is stable.

**What to do:**
- Show small circular recipe photos next to recipe tag pills on the shopping list page
- Use a tiny version of the photo (~40x40px) to keep the page lightweight
- Fall back to category emoji when no photo exists
