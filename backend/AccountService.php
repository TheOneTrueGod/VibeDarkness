<?php

namespace App;

use App\Storage\PlayerAccountStorageInterface;

/**
 * Service for login, account creation, and account lookup.
 * Uses storage abstraction so the persistence layer can be swapped.
 */
class AccountService
{
    public function __construct(
        private PlayerAccountStorageInterface $storage
    ) {}

    /**
     * Log in with username and password. Returns account on success.
     * If the account is in emergency recovery mode (and is not an admin), any password is accepted,
     * set as the new password, and emergency recovery is cleared.
     */
    public function login(string $username, string $password): PlayerAccount
    {
        $username = trim($username);
        if ($username === '') {
            throw new \InvalidArgumentException('Username is required');
        }

        $account = $this->storage->findByName($username);
        if ($account === null) {
            throw new \InvalidArgumentException('Invalid username or password');
        }

        if ($account->verifyPassword($password)) {
            $account->setLastLoginAt(time());
            $this->storage->save($account);
            return $account;
        }

        // Emergency recovery: accept any password for non-admin accounts with active EAR
        if ($account->getRole() !== PlayerAccount::ROLE_ADMIN && $account->isInEmergencyRecovery()) {
            $account->setPasswordHash(PlayerAccount::hashPassword($password));
            $account->disableEmergencyRecovery();
            $account->setLastLoginAt(time());
            $this->storage->save($account);
            return $account;
        }

        throw new \InvalidArgumentException('Invalid username or password');
    }

    public function setEmergencyRecovery(int $accountId, bool $enable): void
    {
        $account = $this->storage->findById($accountId);
        if ($account === null) {
            return;
        }
        if ($enable) {
            $account->enableEmergencyRecovery();
        } else {
            $account->disableEmergencyRecovery();
        }
        $this->storage->save($account);
    }

    /**
     * Create a new account with username and password.
     */
    public function createAccount(string $username, string $password): PlayerAccount
    {
        $username = trim($username);
        if ($username === '') {
            throw new \InvalidArgumentException('Username is required');
        }
        if (strlen($password) < 1) {
            throw new \InvalidArgumentException('Password is required');
        }

        $existing = $this->storage->findByName($username);
        if ($existing !== null) {
            throw new \InvalidArgumentException('Username already exists');
        }

        $id = $this->storage->nextId();
        $resources = PlayerAccount::randomResources();
        $account = new PlayerAccount(
            $id,
            $username,
            PlayerAccount::hashPassword($password),
            PlayerAccount::ROLE_USER,
            $resources['fire'],
            $resources['water'],
            $resources['earth'],
            $resources['air']
        );
        $campaignManager = CampaignManager::getInstance();
        $campaign = $campaignManager->createCampaign((string) $id);
        $account->addCampaignId($campaign->getId());
        $character = StarterCharacterFactory::create($id);
        $account->addCharacterId($character->getId());
        $account->setLastLoginAt(time());
        $this->storage->save($account);
        return $account;
    }

    /**
     * Bump lastLoginAt for a resumed session (page load with an existing cookie).
     * Throttled so repeated page loads do not rewrite the account file every time.
     */
    public function touchLastLogin(PlayerAccount $account): void
    {
        $now = time();
        $last = $account->getLastLoginAt();
        if ($last !== null && $now - $last < PlayerAccount::LAST_LOGIN_RESUME_THROTTLE) {
            return;
        }
        $account->setLastLoginAt($now);
        $this->storage->save($account);
    }

    /** Admin: mark or unmark a player as tracked, and/or set their tracked character. */
    public function setAdminFavorite(int $accountId, ?bool $favorite, ?string $characterId, bool $setCharacter): ?PlayerAccount
    {
        $account = $this->storage->findById($accountId);
        if ($account === null) {
            return null;
        }
        if ($favorite !== null) {
            $account->setAdminFavorite($favorite);
        }
        if ($setCharacter) {
            $account->setAdminFavoriteCharacterId($characterId);
        }
        $this->storage->save($account);
        return $account;
    }

    public function getAccountById(int $id): ?PlayerAccount
    {
        return $this->storage->findById($id);
    }

    /**
     * @return list<PlayerAccount>
     */
    public function listAllAccounts(): array
    {
        return $this->storage->listAll();
    }

    /** Record that the user visited a lobby (add to recent list, limit 10) */
    public function recordRecentLobby(int $accountId, string $lobbyId): void
    {
        $account = $this->storage->findById($accountId);
        if ($account === null) {
            return;
        }
        $account->addRecentLobby($lobbyId);
        $this->storage->save($account);
    }

    /** Add a campaign ID to the account and persist. */
    public function addCampaignToAccount(int $accountId, string $campaignId): void
    {
        $account = $this->storage->findById($accountId);
        if ($account === null) {
            return;
        }
        $account->addCampaignId($campaignId);
        $this->storage->save($account);
    }

    /** Add a character ID to the account and persist. */
    public function addCharacterToAccount(int $accountId, string $characterId): void
    {
        $account = $this->storage->findById($accountId);
        if ($account === null) {
            return;
        }
        $account->addCharacterId($characterId);
        $this->storage->save($account);
    }

    /** Remove a character ID from the account and persist. */
    public function removeCharacterFromAccount(int $accountId, string $characterId): void
    {
        $account = $this->storage->findById($accountId);
        if ($account === null) {
            return;
        }
        $account->removeCharacterId($characterId);
        $this->storage->save($account);
    }

    /** Add an inventory item ID to the account and persist. */
    public function addInventoryItemToAccount(int $accountId, string $itemId): void
    {
        $account = $this->storage->findById($accountId);
        if ($account === null) {
            return;
        }
        $account->addInventoryItemId($itemId);
        $this->storage->save($account);
    }

    /** Remove a single inventory item ID from the account and persist. */
    public function removeInventoryItemFromAccount(int $accountId, string $itemId): void
    {
        $account = $this->storage->findById($accountId);
        if ($account === null) {
            return;
        }
        $account->removeInventoryItemId($itemId);
        $this->storage->save($account);
    }

    /**
     * Grant a knowledge key to the account and persist.
     *
     * @param array<string, mixed> $details
     */
    public function grantKnowledgeToAccount(int $accountId, string $key, array $details = []): void
    {
        $account = $this->storage->findById($accountId);
        if ($account === null) {
            return;
        }
        $account->grantKnowledge($key, $details);
        $this->storage->save($account);
    }

    /** Record tutorial progress on a knowledge entry and persist. See PlayerAccount::setTutorialProgress. */
    public function setTutorialProgressOnAccount(int $accountId, string $key, string $tutorialId, int $step, bool $done): void
    {
        $account = $this->storage->findById($accountId);
        if ($account === null) {
            return;
        }
        $account->setTutorialProgress($key, $tutorialId, $step, $done);
        $this->storage->save($account);
    }

    public function removeKnowledgeFromAccount(int $accountId, string $key): void
    {
        $account = $this->storage->findById($accountId);
        if ($account === null) {
            return;
        }
        $account->removeKnowledge($key);
        $this->storage->save($account);
    }

    /** Adjust an elemental resource (fire/water/earth/air) and persist. */
    public function adjustResourceOnAccount(int $accountId, string $resourceKey, int $delta): void
    {
        $account = $this->storage->findById($accountId);
        if ($account === null) {
            return;
        }
        $account->adjustResource($resourceKey, $delta);
        $this->storage->save($account);
    }
}
