<script lang="ts">
import { computed, defineComponent, ref, Ref } from "vue";
import { useCore } from "@/hooks/useCore";
import BalanceTable from "./BalanceTable.vue";

function useCosmosWallet({
  error,
  mnemonic,
}: {
  error: Ref<string>;
  mnemonic: Ref<string>;
}) {
  const { store, actions } = useCore();

  async function handleDisconnectClicked() {
    try {
      await actions.sifWallet.disconnect();
    } catch (err) {
      error.value = err;
    }
  }

  async function handleConnectClicked() {
    try {
      await actions.sifWallet.connect(mnemonic.value);
    } catch (err) {
      error.value = err;
    }
  }

  const address = computed(() => store.wallet.sif.address);
  const balances = computed(() => store.wallet.sif.balances);
  const connected = computed(() => store.wallet.sif.isConnected);

  return {
    address,
    balances,
    connected,
    handleConnectClicked,
    handleDisconnectClicked,
  };
}

export default defineComponent({
  name: "SifWalletController",
  components: { BalanceTable },
  setup() {
    const error = ref("");
    // TODO: remove hard coded mnemonic
    const mnemonic = ref(
      "race draft rival universe maid cheese steel logic crowd fork comic easy truth drift tomorrow eye buddy head time cash swing swift midnight borrow"
    );

    const {
      balances,
      address,
      connected,
      handleDisconnectClicked,
      handleConnectClicked,
    } = useCosmosWallet({
      error,
      mnemonic,
    });

    const connectionStarted = ref<boolean>(false);

    function handleStartConnectClicked() {
      connectionStarted.value = true;
    }

    return {
      error,
      mnemonic,
      balances,
      address,
      connected,
      connectionStarted,
      handleDisconnectClicked: () => {
        handleDisconnectClicked();
        connectionStarted.value = false;
      },
      handleStartConnectClicked,
      handleConnectClicked,
    };
  },
});
</script>

<template>
  <div>
    <div v-if="connected">
      <p>{{ address }}</p>
      <BalanceTable :balances="balances" />
      <button @click="handleDisconnectClicked">
        Disconnect SifChain Wallet
      </button>
    </div>
    <div v-else>
      <div v-if="!connectionStarted">
        <button @click="handleStartConnectClicked">Connect to SifChain</button>
      </div>
      <div v-else>
        <textarea v-model="mnemonic" placeholder="Mnemonic..."></textarea><br />
        <button @click="connectionStarted = false">Clear</button>
        <button @click="handleConnectClicked">Login</button>
        <div v-if="error">{{ error }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
textarea {
  width: 100%;
  min-height: 50px;
}
</style>