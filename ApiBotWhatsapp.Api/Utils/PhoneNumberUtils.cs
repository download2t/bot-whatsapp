namespace ApiBotWhatsapp.Api.Utils;

public static class PhoneNumberUtils
{
    public static string Normalize(string? value)
    {
        var digits = (value ?? string.Empty).Where(char.IsDigit).ToArray();
        return new string(digits);
    }

    public static string[] GetEquivalentBrazilianNumbers(string? value)
    {
        var normalized = Normalize(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return [];
        }

        var variants = new HashSet<string>(StringComparer.Ordinal)
        {
            normalized
        };

        // Handles Brazilian mobile compatibility with and without the ninth digit.
        if (normalized.StartsWith("55", StringComparison.Ordinal) && normalized.Length == 13 && normalized[4] == '9')
        {
            variants.Add(normalized.Remove(4, 1));
        }

        if (normalized.StartsWith("55", StringComparison.Ordinal) && normalized.Length == 12)
        {
            var firstLocalDigit = normalized[4];
            if (firstLocalDigit is >= '6' and <= '9')
            {
                variants.Add(normalized.Insert(4, "9"));
            }
        }

        return variants.ToArray();
    }
}