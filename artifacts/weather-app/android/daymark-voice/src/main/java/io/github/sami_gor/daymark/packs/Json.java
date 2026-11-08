package io.github.sami_gor.daymark.packs;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Small, strict JSON reader/writer for pack manifests.
 *
 * <p>Android's {@code org.json} is unavailable as a real implementation in JVM
 * unit tests, and a permissive parser would let duplicate or unknown fields
 * change the meaning of a signed document. This parser therefore accepts only
 * UTF-8 JSON with no BOM, no comments, no trailing commas, no duplicate object
 * keys and no non-integer numbers. Depth and input size are bounded.
 *
 * <p>Objects are returned as insertion-ordered {@link LinkedHashMap}s so callers
 * can reject unknown fields deterministically.
 */
final class Json {

    /** Largest manifest document the pack manager accepts. */
    static final int MAX_MANIFEST_BYTES = 64 * 1024;

    private static final int MAX_DEPTH = 16;

    private final String text;
    private int position;

    private Json(String text) {
        this.text = text;
    }

    static final class ParseException extends Exception {
        final String reason;

        ParseException(String reason, String message) {
            super(message);
            this.reason = reason;
        }
    }

    static Object parse(byte[] utf8, int maxBytes) throws ParseException {
        if (utf8 == null) {
            throw new ParseException("invalid-json", "manifest bytes are missing");
        }
        if (maxBytes > 0 && utf8.length > maxBytes) {
            throw new ParseException("invalid-json", "manifest exceeds " + maxBytes + " bytes");
        }
        if (utf8.length >= 3
                && (utf8[0] & 0xff) == 0xef
                && (utf8[1] & 0xff) == 0xbb
                && (utf8[2] & 0xff) == 0xbf) {
            throw new ParseException("invalid-json", "UTF-8 BOM is not allowed");
        }
        String decoded;
        try {
            decoded = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(utf8))
                    .toString();
        } catch (CharacterCodingException e) {
            throw new ParseException("invalid-json", "manifest is not valid UTF-8");
        }
        Json parser = new Json(decoded);
        parser.skipWhitespace();
        Object value = parser.parseValue(0);
        parser.skipWhitespace();
        if (!parser.atEnd()) {
            throw parser.error("invalid-json", "trailing content after the JSON value");
        }
        return value;
    }

    private Object parseValue(int depth) throws ParseException {
        if (depth > MAX_DEPTH) {
            throw error("invalid-json", "JSON nesting is too deep");
        }
        if (atEnd()) {
            throw error("invalid-json", "unexpected end of document");
        }
        char c = text.charAt(position);
        switch (c) {
            case '{':
                return parseObject(depth + 1);
            case '[':
                return parseArray(depth + 1);
            case '"':
                return parseString();
            case 't':
                expectLiteral("true");
                return Boolean.TRUE;
            case 'f':
                expectLiteral("false");
                return Boolean.FALSE;
            case 'n':
                expectLiteral("null");
                return null;
            default:
                if (c == '-' || (c >= '0' && c <= '9')) {
                    return parseInteger();
                }
                throw error("invalid-json", "unexpected character '" + c + "'");
        }
    }

    private Map<String, Object> parseObject(int depth) throws ParseException {
        expect('{');
        Map<String, Object> object = new LinkedHashMap<>();
        skipWhitespace();
        if (peek('}')) {
            position++;
            return object;
        }
        while (true) {
            skipWhitespace();
            if (!peek('"')) {
                throw error("invalid-json", "object key must be a string");
            }
            String key = parseString();
            if (object.containsKey(key)) {
                throw error("duplicate-field", "duplicate field '" + key + "'");
            }
            skipWhitespace();
            expect(':');
            skipWhitespace();
            object.put(key, parseValue(depth));
            skipWhitespace();
            if (peek(',')) {
                position++;
                continue;
            }
            expect('}');
            return object;
        }
    }

    private List<Object> parseArray(int depth) throws ParseException {
        expect('[');
        List<Object> array = new ArrayList<>();
        skipWhitespace();
        if (peek(']')) {
            position++;
            return array;
        }
        while (true) {
            skipWhitespace();
            array.add(parseValue(depth));
            skipWhitespace();
            if (peek(',')) {
                position++;
                continue;
            }
            expect(']');
            return array;
        }
    }

    private String parseString() throws ParseException {
        expect('"');
        StringBuilder out = new StringBuilder();
        while (!atEnd()) {
            char c = text.charAt(position++);
            if (c == '"') {
                return out.toString();
            }
            if (c == '\\') {
                if (atEnd()) {
                    throw error("invalid-json", "unterminated escape sequence");
                }
                char escaped = text.charAt(position++);
                switch (escaped) {
                    case '"':
                        out.append('"');
                        break;
                    case '\\':
                        out.append('\\');
                        break;
                    case '/':
                        out.append('/');
                        break;
                    case 'b':
                        out.append('\b');
                        break;
                    case 'f':
                        out.append('\f');
                        break;
                    case 'n':
                        out.append('\n');
                        break;
                    case 'r':
                        out.append('\r');
                        break;
                    case 't':
                        out.append('\t');
                        break;
                    case 'u':
                        out.append(parseUnicodeEscape());
                        break;
                    default:
                        throw error("invalid-json", "invalid escape sequence");
                }
            } else if (c < 0x20) {
                throw error("invalid-json", "unescaped control character in string");
            } else {
                out.append(c);
            }
        }
        throw error("invalid-json", "unterminated string");
    }

    private char parseUnicodeEscape() throws ParseException {
        if (position + 4 > text.length()) {
            throw error("invalid-json", "truncated unicode escape");
        }
        int value = 0;
        for (int i = 0; i < 4; i++) {
            char digit = text.charAt(position++);
            int nibble = Character.digit(digit, 16);
            if (nibble < 0) {
                throw error("invalid-json", "invalid unicode escape");
            }
            value = (value << 4) | nibble;
        }
        return (char) value;
    }

    private Long parseInteger() throws ParseException {
        int start = position;
        if (peek('-')) {
            position++;
        }
        if (atEnd()) {
            throw error("invalid-json", "truncated number");
        }
        char first = text.charAt(position);
        if (first == '0') {
            position++;
        } else if (first >= '1' && first <= '9') {
            while (!atEnd() && Character.isDigit(text.charAt(position))) {
                position++;
            }
        } else {
            throw error("invalid-json", "invalid number");
        }
        if (!atEnd() && (text.charAt(position) == '.' || text.charAt(position) == 'e'
                || text.charAt(position) == 'E')) {
            throw error("invalid-json", "fractional or exponent numbers are not allowed");
        }
        try {
            return Long.parseLong(text.substring(start, position));
        } catch (NumberFormatException e) {
            throw error("invalid-json", "number is out of range");
        }
    }

    private void expectLiteral(String literal) throws ParseException {
        if (!text.startsWith(literal, position)) {
            throw error("invalid-json", "expected '" + literal + "'");
        }
        position += literal.length();
    }

    private void expect(char expected) throws ParseException {
        if (atEnd() || text.charAt(position) != expected) {
            throw error("invalid-json", "expected '" + expected + "'");
        }
        position++;
    }

    private boolean peek(char c) {
        return !atEnd() && text.charAt(position) == c;
    }

    private void skipWhitespace() {
        while (!atEnd()) {
            char c = text.charAt(position);
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                position++;
            } else {
                return;
            }
        }
    }

    private boolean atEnd() {
        return position >= text.length();
    }

    private ParseException error(String reason, String message) {
        return new ParseException(reason, message + " at offset " + position);
    }

    /** Serialises a string with the minimal escaping needed for valid JSON. */
    static String quote(String value) {
        StringBuilder out = new StringBuilder(value.length() + 2).append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"':
                    out.append("\\\"");
                    break;
                case '\\':
                    out.append("\\\\");
                    break;
                case '\b':
                    out.append("\\b");
                    break;
                case '\f':
                    out.append("\\f");
                    break;
                case '\n':
                    out.append("\\n");
                    break;
                case '\r':
                    out.append("\\r");
                    break;
                case '\t':
                    out.append("\\t");
                    break;
                default:
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
            }
        }
        return out.append('"').toString();
    }
}
