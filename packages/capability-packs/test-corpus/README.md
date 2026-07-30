# Test corpus

Fixtures for `scanner.test.ts`. Deliberately unformatted: prettier is configured to
skip this directory, because reflowing an attack string changes what is under test.

`benign-lookalike/` is the important half. A scanner that only ever ran against
malicious fixtures would pass with `pattern = /./` and nobody would notice.
