namespace ApiBotWhatsapp.Api.Services;

// Saves message attachments (images/videos/documents) to wwwroot/uploads/{ownerUserId}/ so the
// same file the user sent (or received) can be shown again in the chat history later, instead of
// only keeping a "[Mídia: filename]" text placeholder like before.
public class MediaStorageService(IWebHostEnvironment environment)
{
    public string SaveBase64(int ownerUserId, string base64, string? mimeType, string? originalFileName)
    {
        var webRoot = string.IsNullOrWhiteSpace(environment.WebRootPath)
            ? Path.Combine(environment.ContentRootPath, "wwwroot")
            : environment.WebRootPath;

        var ownerFolder = Path.Combine(webRoot, "uploads", ownerUserId.ToString());
        Directory.CreateDirectory(ownerFolder);

        var extension = Path.GetExtension(originalFileName);
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = MimeTypeToExtension(mimeType);
        }

        var fileName = $"{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}{extension}";
        var filePath = Path.Combine(ownerFolder, fileName);

        var bytes = Convert.FromBase64String(base64);
        File.WriteAllBytes(filePath, bytes);

        return $"/uploads/{ownerUserId}/{fileName}";
    }

    private static string MimeTypeToExtension(string? mimeType)
    {
        return mimeType?.ToLowerInvariant() switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/gif" => ".gif",
            "image/webp" => ".webp",
            "video/mp4" => ".mp4",
            "video/3gpp" => ".3gp",
            "application/pdf" => ".pdf",
            _ => ".bin"
        };
    }
}
