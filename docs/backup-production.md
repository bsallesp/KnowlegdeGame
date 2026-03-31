# Backup de Banco em Producao

Este projeto usa uma estrategia hibrida para backup profissional com baixo custo:

1. Backup nativo do Azure PostgreSQL (PITR) com retencao de 35 dias.
2. Dump logico diario (`pg_dump`) enviado para Blob Storage.
3. Lifecycle no Blob: mover para Cool em 30 dias e apagar em 90 dias.

## Estado aplicado

- Servidor: `psql-shared-bsall`
- Resource group do banco: `rg-databases-shared`
- Storage account de backup: `dystoppiast`
- Container de backup: `pg-backups`

## Secrets no GitHub Actions

Configure no repositorio:

- `AZURE_CREDENTIALS`: service principal em JSON (ja usado no deploy).
- `PROD_DATABASE_URL`: string de conexao do banco de producao.
- `BACKUP_STORAGE_ACCOUNT_NAME`: `dystoppiast`
- `BACKUP_STORAGE_ACCOUNT_KEY`: chave da storage account.
- `BACKUP_CONTAINER`: `pg-backups`

## Workflow de backup

Arquivo: `.github/workflows/backup-prod-db.yml`

- Executa diariamente as 02:00 UTC.
- Pode ser executado manualmente por `workflow_dispatch`.
- Usa o script `scripts/backup-postgres-to-blob.sh`.

## Restore de teste (mensal)

Recomendado 1x por mes:

1. Baixar um dump recente do container `pg-backups`.
2. Restaurar em banco temporario de homologacao.
3. Validar tabelas criticas e contagem basica de registros.
4. Registrar tempo de restore (RTO real).
