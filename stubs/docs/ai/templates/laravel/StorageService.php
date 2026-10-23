<?php

namespace App\Services\Storage;

use Illuminate\Contracts\Filesystem\Factory as Filesystems;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The ONLY place the app touches file storage. Controllers, jobs and other services call this class;
 * they never call Storage:: or move uploads themselves. See docs/ai/STORAGE.md.
 *
 * Disk rule:
 *  - Cloud disk configured  -> cloud for everything (visibility is set per file).
 *  - No cloud configured    -> PUBLIC files go to the `public` disk,
 *                              PRIVATE files go to the `local` disk (never exposed by URL) and are served through an
 *                              authorized download route.
 */
class StorageService
{
    public const PUBLIC = 'public';
    public const PRIVATE = 'private';

    public function __construct(protected Filesystems $filesystems)
    {
    }

    // ---- pure helpers (no framework state; unit-tested) -------------------------------------------------------

    /** A cloud disk counts as configured only when its required settings are non-empty. */
    public static function isCloudConfigured(?array $diskConfig): bool
    {
        if (! $diskConfig) {
            return false;
        }

        $driver = $diskConfig['driver'] ?? null;

        if ($driver === 's3') {
            return ! empty($diskConfig['key']) && ! empty($diskConfig['secret']) && ! empty($diskConfig['bucket']);
        }

        if ($driver === null || $driver === 'local') {
            return false;
        }

        // Other cloud drivers (gcs, azure, ...): require a bucket or container name.
        return ! empty($diskConfig['bucket']) || ! empty($diskConfig['container']);
    }

    public static function diskNameFor(string $visibility, ?string $cloudDisk, bool $cloudConfigured): string
    {
        if ($cloudConfigured && $cloudDisk) {
            return $cloudDisk;
        }

        return $visibility === self::PUBLIC ? 'public' : 'local';
    }

    /** companies/{company}/{directory}/{id}.{ext}. Only safe characters survive; the id is generated, never user input. */
    public static function buildPath(int|string $companyId, string $directory, string $extension, string $id): string
    {
        $company = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $companyId);
        $dir = preg_replace('#/+#', '/', preg_replace('#[^A-Za-z0-9/_-]#', '', str_replace('\\', '/', $directory)));
        $dir = trim($dir, '/');
        $ext = strtolower(preg_replace('/[^A-Za-z0-9]/', '', $extension));

        if ($company === '' || $dir === '' || $id === '') {
            throw new InvalidArgumentException('Company, directory and id are required to build a storage path.');
        }

        return "companies/{$company}/{$dir}/{$id}".($ext !== '' ? ".{$ext}" : '');
    }

    // ---- operations -------------------------------------------------------------------------------------------

    /**
     * Store an upload (already validated by a Form Request: mime, size). Returns what to save on the file record.
     *
     * @return array{disk:string,path:string,visibility:string,name:string,mime:?string,size:int}
     */
    public function store(UploadedFile $file, string $directory, int|string $companyId, string $visibility = self::PRIVATE): array
    {
        if (! in_array($visibility, [self::PUBLIC, self::PRIVATE], true)) {
            throw new InvalidArgumentException("Unknown visibility [{$visibility}].");
        }
        if (! $file->isValid()) {
            throw new RuntimeException('Upload failed or is invalid.');
        }

        $diskName = $this->diskName($visibility);
        $path = self::buildPath($companyId, $directory, $file->extension() ?: '', strtolower((string) Str::ulid()));

        $stored = $this->disk($diskName)->putFileAs(
            dirname($path),
            $file,
            basename($path),
            ['visibility' => $visibility === self::PUBLIC ? 'public' : 'private'],
        );

        if ($stored === false) {
            throw new RuntimeException('Could not write the file to storage.');
        }

        return [
            'disk' => $diskName,
            'path' => $path,
            'visibility' => $visibility,
            'name' => $file->getClientOriginalName(),   // display only, never used in a path
            'mime' => $file->getMimeType(),              // detected by the server, not the client header
            'size' => (int) $file->getSize(),
        ];
    }

    /** Public URL. Only for files stored with PUBLIC visibility. */
    public function url(string $disk, string $path): string
    {
        return $this->disk($disk)->url($path);
    }

    /** Time-limited URL for private files on a cloud disk. On local fallback use download() behind a route. */
    public function temporaryUrl(string $disk, string $path, int $minutes = 10): string
    {
        return $this->disk($disk)->temporaryUrl($path, now()->addMinutes($minutes));
    }

    /** Stream a private file. The caller must authorize against the file RECORD (Policy) before calling this. */
    public function download(string $disk, string $path, ?string $downloadName = null): StreamedResponse
    {
        return $this->disk($disk)->download($path, $downloadName);
    }

    public function exists(string $disk, string $path): bool
    {
        return $this->disk($disk)->exists($path);
    }

    public function delete(string $disk, string $path): bool
    {
        return $this->disk($disk)->delete($path);
    }

    // ---- internals --------------------------------------------------------------------------------------------

    protected function diskName(string $visibility): string
    {
        $cloud = (string) config('filesystems.app_cloud_disk', 's3');

        return self::diskNameFor(
            $visibility,
            $cloud,
            self::isCloudConfigured(config("filesystems.disks.{$cloud}")),
        );
    }

    protected function disk(string $name): FilesystemAdapter
    {
        return $this->filesystems->disk($name);
    }
}
