# Contributing

## Scope and Principles

- Keep each change scoped and reviewable.
- Prefer local, deterministic verification before opening a PR.
- Avoid unrelated refactors in feature or bug-fix branches.

## Local Setup

```bash
bun --cwd frontend install
```

## Verification Checklist

Run these commands before requesting merge:

```bash
cargo test --manifest-path backend/Cargo.toml
bun --cwd frontend test
bun --cwd frontend build
```

## Typical Contribution Areas

- Add or improve source parsers and fixture coverage in `backend/tests/fixtures`.
- Improve dashboard UX and filtering behavior in `frontend/src`.
- Improve scripts and docs for easier onboarding.

## Pull Request Notes

- Explain user-visible behavior changes.
- Include verification commands and outcomes.
- Call out residual risks or follow-up work explicitly.

## 中文补充

- 提交前请运行上述验证命令。
- PR 说明请包含变更范围、验证结果、已知风险与后续项。
