#!/bin/bash
set -e
az webapp delete --name dystoppia-v2-app --resource-group rg-dystoppia-v2 || true
az appservice plan delete --name asp-dystoppia-v2 --resource-group rg-dystoppia-v2 --yes || true
az monitor log-analytics workspace delete --workspace-name law-dystoppia-v2 --resource-group rg-dystoppia-v2 --yes || true
az monitor app-insights component delete --app appi-dystoppia-v2 --resource-group rg-dystoppia-v2 || true
echo "Recursos antigos removidos."
