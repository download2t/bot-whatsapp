namespace ApiBotWhatsapp.Api.Utils;

public static class PhoneNumberUtils
{
    public static string Normalize(string? value)
    {
        var digits = (value ?? string.Empty).Where(char.IsDigit).ToArray();
        return new string(digits);
    }

    /// <summary>
    /// The last N digits of a phone number (default 8, a typical local-number length).
    /// Used to match contacts regardless of country code / "9" mobile prefix differences
    /// between how a number was typed into Contatos and how WhatsApp reports it on a webhook
    /// (WhatsApp always includes the full country code; people often don't when typing a
    /// contact). Comparing by suffix instead of exact string absorbs both problems generically,
    /// for any country, without needing per-country formatting rules.
    /// </summary>
    public static string CoreDigits(string? value, int length = 8)
    {
        var digits = Normalize(value);
        return digits.Length <= length ? digits : digits[^length..];
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