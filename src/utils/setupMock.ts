export default (config: { mock?: boolean; setup: () => void }) => {
  const { mock = import.meta.env.DEV, setup } = config;
  if (mock === false) return;
  setup();
};
