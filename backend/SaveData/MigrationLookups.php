<?php

namespace App\SaveData;

use App\Storage\FlatFilePlayerAccountStorage;

/**
 * Raw-JSON lookups for CampaignMigrations (campaign -> owner account -> characters).
 * Reads files directly (never through CharacterManager) so migrations cannot trigger
 * nested on-load persists.
 */
final class MigrationLookups
{
    /** @var array<string, list<string>>|null campaignId -> character ids */
    private ?array $charactersByCampaign = null;

    public function __construct(private readonly string $storageDir)
    {
    }

    /** @return list<string> */
    public function ownerCharacterIds(string $campaignId): array
    {
        if ($this->charactersByCampaign === null) {
            $this->charactersByCampaign = [];
            $accountsDir = $this->storageDir . '/accounts';
            if (is_dir($accountsDir)) {
                $storage = new FlatFilePlayerAccountStorage($accountsDir);
                foreach ($storage->listAll() as $account) {
                    foreach ($account->getCampaignIds() as $cid) {
                        // The owner default campaign is campaignIds[0]; all listed campaigns belong to the account.
                        $key = (string) $cid;
                        $this->charactersByCampaign[$key] = array_values(array_unique(array_merge(
                            $this->charactersByCampaign[$key] ?? [],
                            array_map('strval', $account->getCharacterIds())
                        )));
                    }
                }
            }
        }
        return $this->charactersByCampaign[$campaignId] ?? [];
    }

    /** @return array<string, mixed>|null */
    public function loadCharacter(string $characterId): ?array
    {
        if (!preg_match('/^[A-Za-z0-9_\-]+$/', $characterId)) {
            return null;
        }
        $path = $this->storageDir . '/characters/' . $characterId . '.json';
        if (!is_file($path)) {
            return null;
        }
        $data = json_decode((string) file_get_contents($path), true);
        return is_array($data) ? $data : null;
    }
}
