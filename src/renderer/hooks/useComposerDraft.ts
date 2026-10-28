import { useState, useRef, useEffect, useCallback, type SetStateAction } from "react";
import {
  DraftPersistenceController,
  MAX_PERSISTED_DRAFT_IMAGES,
  MAX_PERSISTED_DRAFT_IMAGE_BYTES,
  getDraft,
  selectDraftImageAdditions,
  type ChatDraftImage,
} from "@/lib/draft-store";
import { processImageFileBatch } from "@/lib/image-file-processing";
import type { LocalFileReference } from "@/lib/file-url";
import {
  failedComposerSubmissionAction,
  mergeFailedSubmissionFiles,
  mergeFailedSubmissionImages,
  type ComposerSubmissionSnapshot,
} from "@/lib/composer-submission";

export interface AttachedImage {
  data: string; // base64, no prefix
  mimeType: string;
  previewUrl: string; // object URL for display
}

function imageToDraftImage(image: AttachedImage): ChatDraftImage {
  return { data: image.data, mimeType: image.mimeType };
}

function draftImageToAttachedImage(image: ChatDraftImage): AttachedImage {
  return {
    ...image,
    previewUrl: `data:${image.mimeType};base64,${image.data}`,
  };
}

function revokeImagePreview(image: AttachedImage): void {
  if (image.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

/** Draft data, attachment resources and persistence share one owner per composer. */
export function useComposerDraft({
  draftKey,
  draftPromotionFrom,
  onReplace,
}: {
  draftKey?: string;
  draftPromotionFrom?: string;
  onReplace: () => void;
}) {
  const [value, setValueState] = useState(() => (draftKey ? (getDraft(draftKey)?.value ?? "") : ""));
  const [attachedImages, setAttachedImagesState] = useState<AttachedImage[]>(() =>
    draftKey ? (getDraft(draftKey)?.images.map(draftImageToAttachedImage) ?? []) : [],
  );
  const [attachedFiles, setAttachedFilesState] = useState<LocalFileReference[]>(() =>
    draftKey ? (getDraft(draftKey)?.files?.map((file) => ({ ...file })) ?? []) : [],
  );
  const [imageAttachNotice, setImageAttachNotice] = useState<string | null>(null);
  const [submissionNotice, setSubmissionNotice] = useState<string | null>(null);
  const draftKeyRef = useRef(draftKey);
  const valueRef = useRef(value);
  const attachedImagesRef = useRef(attachedImages);
  const attachedFilesRef = useRef(attachedFiles);
  const imageBatchGenerationRef = useRef(0);
  const imageProcessingActiveRef = useRef(true);
  const pendingImagePreviewsRef = useRef(new Set<string>());
  const inputRevisionRef = useRef(0);
  const draftPersistenceErrorHandlerRef = useRef<() => void>(() => {});
  const draftPersistenceRef = useRef<DraftPersistenceController | null>(null);
  draftPersistenceErrorHandlerRef.current = () =>
    setSubmissionNotice(
      "Draft could not be saved on this device. Your current input is still on screen; check available storage.",
    );
  if (!draftPersistenceRef.current) {
    draftPersistenceRef.current = new DraftPersistenceController(500, undefined, () =>
      draftPersistenceErrorHandlerRef.current(),
    );
  }
  const setValue = useCallback((next: SetStateAction<string>) => {
    const resolved = typeof next === "function" ? next(valueRef.current) : next;
    inputRevisionRef.current += 1;
    valueRef.current = resolved;
    setValueState(resolved);
  }, []);
  const setAttachedImages = useCallback((next: SetStateAction<AttachedImage[]>) => {
    const resolved = typeof next === "function" ? next(attachedImagesRef.current) : next;
    inputRevisionRef.current += 1;
    attachedImagesRef.current = resolved;
    setAttachedImagesState(resolved);
  }, []);
  const setAttachedFiles = useCallback((next: SetStateAction<LocalFileReference[]>) => {
    const resolved = typeof next === "function" ? next(attachedFilesRef.current) : next;
    inputRevisionRef.current += 1;
    attachedFilesRef.current = resolved;
    setAttachedFilesState(resolved);
  }, []);

  const processImageAttachments = useCallback(
    async (imageFiles: File[]): Promise<string[]> => {
      if (imageFiles.length === 0) return [];
      const generation = ++imageBatchGenerationRef.current;
      const { images, failures } = await processImageFileBatch(imageFiles);
      if (!imageProcessingActiveRef.current) {
        images.forEach(revokeImagePreview);
        return [];
      }
      const notices: string[] = [];
      if (images.length > 0) {
        const selection = selectDraftImageAdditions(attachedImagesRef.current, images);
        selection.accepted.forEach((image) => pendingImagePreviewsRef.current.add(image.previewUrl));
        selection.rejected.forEach(({ image }) => revokeImagePreview(image));
        if (selection.accepted.length > 0) {
          setAttachedImages((prev) => [...prev, ...selection.accepted]);
        }
        if (selection.rejected.some(({ reason }) => reason === "count")) {
          notices.push(
            "A draft can save up to {count} images. Remove an image before adding another.".replace(
              "{count}",
              String(MAX_PERSISTED_DRAFT_IMAGES),
            ),
          );
        }
        if (selection.rejected.some(({ reason }) => reason === "bytes")) {
          notices.push(
            "The total image size exceeds the {size} MB draft limit. Remove or compress some images.".replace(
              "{size}",
              String(MAX_PERSISTED_DRAFT_IMAGE_BYTES / 1024 / 1024),
            ),
          );
        }
      }
      if (generation === imageBatchGenerationRef.current && failures.length > 0) {
        notices.push(
          images.length > 0
            ? "{failed} of {total} images could not be attached"
                .replace("{failed}", String(failures.length))
                .replace("{total}", String(imageFiles.length))
            : "The selected images could not be attached",
        );
      }
      return notices;
    },
    [setAttachedImages],
  );

  // Browsers do not expose local filesystem paths for dropped or picked files,
  // so non-image files cannot be referenced by path.
  const processLocalFileReferences = useCallback((files: File[]): string[] => {
    if (files.length === 0) return [];
    return ["{count} files had no local path and were not added".replace("{count}", String(files.length))];
  }, []);

  const processFiles = useCallback(
    async (files: File[]) => {
      // Attaching is allowed while streaming; sending is gated separately,
      // so the user can prepare files for the next prompt while the agent runs.
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      const localFiles = files.filter((file) => !file.type.startsWith("image/"));
      const notices = await processImageAttachments(imageFiles);
      if (!imageProcessingActiveRef.current) return;
      notices.push(...processLocalFileReferences(localFiles));
      setImageAttachNotice(notices.length > 0 ? notices.join(". ") : null);
    },
    [processImageAttachments, processLocalFileReferences],
  );

  const removeImage = useCallback(
    (index: number) => {
      setAttachedImages((prev) => {
        const next = [...prev];
        const [removed] = next.splice(index, 1);
        if (removed) revokeImagePreview(removed);
        return next;
      });
    },
    [setAttachedImages],
  );

  const clearImages = useCallback(() => {
    setAttachedImages((prev) => {
      prev.forEach(revokeImagePreview);
      return [];
    });
  }, [setAttachedImages]);

  const removeFile = useCallback(
    (index: number) => {
      setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    },
    [setAttachedFiles],
  );

  const clearDraft = useCallback(() => {
    setValue("");
    if (draftKey) draftPersistenceRef.current?.clear(draftKey);
    if (draftKeyRef.current && draftKeyRef.current !== draftKey) {
      draftPersistenceRef.current?.clear(draftKeyRef.current);
    }
    clearImages();
    setAttachedFiles([]);
  }, [clearImages, draftKey, setAttachedFiles, setValue]);

  const restoreFailedSubmission = useCallback(
    (snapshot: ComposerSubmissionSnapshot, clearedAtRevision: number, kind: "send" | "queue") => {
      const action = failedComposerSubmissionAction(clearedAtRevision, inputRevisionRef.current);
      if (action === "restore") {
        setValue(snapshot.value);
        setAttachedImages(snapshot.images);
        setAttachedFiles(snapshot.files ?? []);
      } else {
        if (snapshot.images.length > 0) {
          setAttachedImages((current) => mergeFailedSubmissionImages(current, snapshot.images));
        }
        if (snapshot.files.length > 0) {
          setAttachedFiles((current) => mergeFailedSubmissionFiles(current, snapshot.files));
        }
      }
      setSubmissionNotice(
        action === "restore"
          ? kind === "send"
            ? "Message was not sent. Your draft was restored."
            : "Message could not be queued. Your draft was restored."
          : kind === "send"
            ? "The previous message was not sent. Your newer draft was kept."
            : "The previous message could not be queued. Your newer draft was kept.",
      );
    },
    [setAttachedFiles, setAttachedImages, setValue],
  );

  const commitCurrentDraft = useCallback(() => {
    const currentDraftKey = draftKeyRef.current;
    if (!currentDraftKey) return;
    draftPersistenceRef.current?.commit(currentDraftKey, {
      value: valueRef.current,
      images: attachedImagesRef.current.map(imageToDraftImage),
      files: attachedFilesRef.current,
    });
  }, []);

  useEffect(() => {
    if (!draftKey || draftKeyRef.current !== draftKey) return;
    draftPersistenceRef.current?.schedule(draftKey, {
      value,
      images: attachedImages.map(imageToDraftImage),
      files: attachedFiles,
    });
  }, [attachedFiles, attachedImages, draftKey, value]);

  useEffect(() => {
    const previousDraftKey = draftKeyRef.current;
    if (previousDraftKey === draftKey) return;

    if (draftKey && previousDraftKey && previousDraftKey === draftPromotionFrom) {
      draftPersistenceRef.current?.promote(previousDraftKey, draftKey, {
        value: valueRef.current,
        images: attachedImagesRef.current.map(imageToDraftImage),
        files: attachedFilesRef.current,
      });
      draftKeyRef.current = draftKey;
      return;
    }

    if (previousDraftKey) {
      draftPersistenceRef.current?.commit(previousDraftKey, {
        value: valueRef.current,
        images: attachedImagesRef.current.map(imageToDraftImage),
        files: attachedFilesRef.current,
      });
    }

    const draft = draftKey ? getDraft(draftKey) : null;
    draftKeyRef.current = draftKey;
    setValue(draft?.value ?? "");
    onReplace();
    setAttachedImages((prev) => {
      prev.forEach(revokeImagePreview);
      return draft?.images.map(draftImageToAttachedImage) ?? [];
    });
    setAttachedFiles(draft?.files?.map((file) => ({ ...file })) ?? []);
  }, [draftKey, draftPromotionFrom, onReplace, setAttachedFiles, setAttachedImages, setValue]);

  useEffect(() => {
    for (const image of attachedImages) pendingImagePreviewsRef.current.delete(image.previewUrl);
  }, [attachedImages]);

  useEffect(() => {
    const pendingPreviews = pendingImagePreviewsRef.current;
    imageProcessingActiveRef.current = true;
    return () => {
      imageProcessingActiveRef.current = false;
      commitCurrentDraft();
      draftPersistenceRef.current?.dispose();
      for (const previewUrl of pendingPreviews) URL.revokeObjectURL(previewUrl);
      pendingPreviews.clear();
      attachedImagesRef.current.forEach(revokeImagePreview);
    };
  }, [commitCurrentDraft]);

  // File references can only come from restored drafts; the backend resolves them.
  const validateLocalFileReferences = useCallback(
    (_files: readonly LocalFileReference[]): Promise<boolean> => Promise.resolve(true),
    [],
  );

  const getRevision = useCallback(() => inputRevisionRef.current, []);
  return {
    value,
    setValue,
    attachedImages,
    attachedFiles,
    imageAttachNotice,
    setImageAttachNotice,
    submissionNotice,
    setSubmissionNotice,
    processFiles,
    removeImage,
    removeFile,
    clearDraft,
    restoreFailedSubmission,
    commitCurrentDraft,
    validateLocalFileReferences,
    getRevision,
  };
}
