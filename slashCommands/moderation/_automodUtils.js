const MAX_KEYWORDS = 1000;
const MAX_KEYWORD_LENGTH = 60;

function parseKeywords(input) {
    const keywords = [];
    const matcher = /"([^"\r\n]*)"|([^,"]+)/g;
    let match;

    while ((match = matcher.exec(input)) !== null) {
        const keyword = (match[1] ?? match[2]).trim();
        if (keyword) keywords.push(keyword);
    }

    return [...new Set(keywords)];
}

function getKeywordValidationError(keywords) {
    if (!keywords.length) return 'Enter at least one word or phrase.';
    if (keywords.length > MAX_KEYWORDS) {
        return `Discord AutoMod supports up to ${MAX_KEYWORDS} keywords in one rule.`;
    }

    const tooLong = keywords.find((keyword) => keyword.length > MAX_KEYWORD_LENGTH);
    if (tooLong) {
        return `Each AutoMod word or phrase must be ${MAX_KEYWORD_LENGTH} characters or fewer. Invalid entry: \`${tooLong}\``;
    }

    return null;
}

module.exports = { parseKeywords, getKeywordValidationError };
