# STORAGE.md: File Storage Through One Service

Read this when the task stores, serves, or deletes files: uploads, avatars, attachments, exports, generated PDFs, imports.

**Rule:** all file access goes through one `StorageService`. Controllers, jobs and other services never call `Storage::` or `move()` themselves.

**Disk rule:**

| Situation | Public files | Private files |
|---|---|---|
| Cloud storage is configured (S3 or an S3-compatible service) | cloud disk | cloud disk, served by temporary URL |
| **No cloud storage** | **`public` disk** | **`local` disk** (not reachable by URL), served through an authorized route |

Private files stay off the `public` disk even in the fallback. The `public` disk is reachable by URL, so a private document placed there would be exposed to anyone who guesses the link. If you want everything on the public disk anyway, that is a security decision: write it as an AD-n and get the user's approval.

Template: `docs/ai/templates/laravel/StorageService.php` (copy to `app/Services/Storage/StorageService.php`).

---

## 1. Setup

`config/filesystems.php`, add one key next to `default`:

```php
'app_cloud_disk' => env('APP_CLOUD_DISK', 's3'),   // which cloud disk to use when it is configured
```

No cloud account? Leave the AWS variables out. The service detects that and uses the fallback. Nothing else to change.

Cloud (S3 or compatible: Cloudflare R2, DigitalOcean Spaces, Backblaze B2, MinIO), `.env`:

```text
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=...
AWS_BUCKET=...
AWS_ENDPOINT=https://...        # only for S3-compatible services
AWS_USE_PATH_STYLE_ENDPOINT=true # often needed by MinIO and some compatible services
```

Install the S3 adapter only when the cloud is used (PACKAGES.md intake checklist): `composer require league/flysystem-aws-s3-v3 "^3.0"`.

Fallback setup, once per environment:

```bash
php artisan storage:link
```

On Windows/Laragon the symlink may need an elevated terminal (Run as administrator).

## 2. File record

Every stored file has a database row (a `files` table or the owning model's columns). Store `disk`, `path`, `visibility`, `name`, `mime`, `size`, `company_id`, and the uploader. Reading the **disk from the row** (not from config) is what lets old files keep working after you switch from the fallback to the cloud.

## 3. Rules

- **Validate in a Form Request:** allowed mimes, extension, max size. The service stores; it does not decide what is allowed.
- **Paths are generated:** `companies/{company_id}/{directory}/{ulid}.{ext}`. The client file name is stored for display only and never used in a path. This gives tenant separation and blocks path tricks.
- **Authorize on the record.** Download and delete routes load the file row, run a Policy (tenant and permission, ACCESS.md), then call the service. An unguessable URL is not authorization.
- **Public means public.** Only things that are meant for anyone (logos, public product images) use PUBLIC. Everything else is PRIVATE.
- **Large or slow work** (exports, PDF generation, image processing) runs in a queued Job that calls the service.
- **Delete with the record**, and delete files in a queued job after commit so a rollback cannot orphan or lose them.
- **Libraries:** if `spatie/laravel-medialibrary` is used, set its disk from the same rule instead of hard-coding one, and keep tenant paths.
- **Backups:** cloud buckets get versioning or lifecycle rules; local fallback is included in the server backup.

## 4. Tests

- Backend: `Storage::fake('public')` and `Storage::fake('local')` (or the cloud disk name). Assert the file lands on the expected disk and path, a private file has no public URL, and another company cannot download it.
- Unit: test the pure helpers (`isCloudConfigured`, `diskNameFor`, `buildPath`).
- E2E: upload as company A, then confirm company B cannot open the download route (403/404).

## 5. Definition of done

- [ ] No `Storage::` or direct file writes outside `StorageService`.
- [ ] Works with no cloud settings (fallback) and with cloud settings.
- [ ] Private files are not reachable by URL in the fallback.
- [ ] Download and delete are authorized against the record.
- [ ] Tenant path, validation, and tests exist and ran. Anything not run is Not Tested.
