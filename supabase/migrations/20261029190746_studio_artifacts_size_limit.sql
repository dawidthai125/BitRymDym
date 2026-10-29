-- Applied on prod as a temporary experiment (bucket limit raised) and reverted by
-- 20261029190813_studio_artifacts_size_limit_revert. Kept as a no-op so history matches prod;
-- the effective limit stays the global 50 MB (see the revert migration).
select 1;
