/**
 * ProfilePicture — Beta-5 (T-B5-11)
 *
 * Upload, preview, and remove the current user's profile picture.
 * Uses a hidden file input triggered by a visible text link. Shows
 * a FileReader preview before the actual upload so the user can
 * confirm before committing.
 *
 * Props:
 *   currentUrl   — existing full-size picture URL, or null if not set
 *   displayName  — user's display name, forwarded to Avatar for initials
 */

import { useState, useRef } from 'preact/hooks';
import { uploadProfilePicture, deleteProfilePicture } from '../lib/api';
import { t } from '../i18n/i18n';
import { showToast } from './Toast';
import Avatar from './Avatar';

export interface Props {
  currentUrl: string | null;
  displayName: string;
}

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB

export default function ProfilePicture({ currentUrl, displayName }: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleChangeLinkClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      showToast(t('profile_picture.error_too_large'), 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      showToast(t('profile_picture.error_invalid_format'), 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreview(ev.target?.result as string);
      setPendingFile(file);
    };
    reader.readAsDataURL(file);
  }

  function handleCancelPreview() {
    setPreview(null);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleUpload() {
    if (!pendingFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', pendingFile);
      await uploadProfilePicture(formData);
      showToast(t('profile_picture.upload_success'), 'success');
      window.location.reload();
    } catch {
      showToast(t('profile_picture.upload_error'), 'error');
      setPreview(null);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!confirm(t('profile_picture.remove_confirm'))) return;

    setUploading(true);
    try {
      await deleteProfilePicture();
      showToast(t('profile_picture.remove_success'), 'success');
      window.location.reload();
    } catch {
      showToast(t('profile_picture.remove_error'), 'error');
    } finally {
      setUploading(false);
    }
  }

  // The URL shown in the Avatar: preview takes precedence while pending
  const displayThumb = preview ?? currentUrl;

  return (
    <div style="display:flex;flex-direction:column;align-items:center;gap:var(--space-3)">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        style="display:none"
        onChange={handleFileChange}
      />

      {/* Avatar — hero size (96px) */}
      <Avatar
        displayName={displayName}
        thumbUrl={displayThumb}
        size="hero"
      />

      {/* Pending preview: show upload / cancel controls */}
      {preview ? (
        <div style="display:flex;flex-direction:column;align-items:center;gap:var(--space-2)">
          <span style="font-size:var(--font-size-xs);color:var(--color-gray-500)">
            {t('profile_picture.preview_hint')}
          </span>
          <div style="display:flex;gap:var(--space-2)">
            <button
              type="button"
              class="btn-secondary"
              onClick={handleCancelPreview}
              disabled={uploading}
            >
              {t('buttons.cancel')}
            </button>
            <button
              type="button"
              class="btn-primary"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? t('profile_picture.uploading') : t('profile_picture.upload_cta')}
            </button>
          </div>
        </div>
      ) : (
        <div style="display:flex;flex-direction:column;align-items:center;gap:var(--space-1)">
          {/* Change / Add photo link */}
          <button
            type="button"
            onClick={handleChangeLinkClick}
            disabled={uploading}
            style="background:none;border:none;padding:0;font-size:var(--font-size-sm);color:var(--color-primary);cursor:pointer;text-decoration:underline"
          >
            {currentUrl ? t('profile_picture.change_photo') : t('profile_picture.add_photo')}
          </button>

          {/* Remove photo link — only when a picture exists */}
          {currentUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              style="background:none;border:none;padding:0;font-size:var(--font-size-sm);color:var(--color-danger);cursor:pointer;text-decoration:underline"
            >
              {t('profile_picture.remove_photo')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
