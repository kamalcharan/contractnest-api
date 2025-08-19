// src/graphql/resolvers/serviceCatalog/serviceCatalogDataLoaders.ts
// 🚀 Service Catalog DataLoaders - Optimize N+1 query problems with efficient batch loading

import DataLoader from 'dataloader';
import { EdgeFunctionClient } from '../../../utils/edgeFunctionClient';
import {
  ServiceCatalogItem,
  ServiceCategory,
  ServiceIndustry,
  AvailableResource,
  ServiceResourceAssociation,
  ServicePricingHistory,
  CurrencyOption,
  TaxRateOption
} from '../../../types/serviceCatalogGraphQL';

// =================================================================
// DATALOADER CONFIGURATION
// =================================================================

interface DataLoaderConfig {
  maxBatchSize?: number;
  batchScheduleFn?: (callback: () => void) => void;
  cacheKeyFn?: (key: any) => string;
  cacheMap?: Map<string, any>;
}

interface ServiceCatalogDataLoaderContext {
  tenantId: string;
  userId: string;
  isLive: boolean;
  requestId: string;
  edgeFunctionClient: EdgeFunctionClient;
}

// =================================================================
// SERVICE CATALOG DATALOADERS CLASS
// =================================================================

export class ServiceCatalogDataLoaders {
  private context: ServiceCatalogDataLoaderContext;
  private config: DataLoaderConfig;

  // DataLoader instances
  private _servicesByIdsLoader?: DataLoader<string, ServiceCatalogItem | null>;
  private _categoriesByIdsLoader?: DataLoader<string, ServiceCategory | null>;
  private _industriesByIdsLoader?: DataLoader<string, ServiceIndustry | null>;
  private _resourcesByIdsLoader?: DataLoader<string, AvailableResource | null>;
  private _serviceResourcesLoader?: DataLoader<string, ServiceResourceAssociation[]>;
  private _servicePricingHistoryLoader?: DataLoader<string, ServicePricingHistory[]>;
  private _currenciesByCodesLoader?: DataLoader<string, CurrencyOption | null>;
  private _taxRatesByIdsLoader?: DataLoader<string, TaxRateOption | null>;
  private _servicesByCategoryLoader?: DataLoader<string, ServiceCatalogItem[]>;
  private _servicesByIndustryLoader?: DataLoader<string, ServiceCatalogItem[]>;
  private _resourcesByTypeLoader?: DataLoader<string, AvailableResource[]>;

  constructor(context: ServiceCatalogDataLoaderContext, config: DataLoaderConfig = {}) {
    this.context = context;
    this.config = {
      maxBatchSize: 100,
      batchScheduleFn: (callback) => setTimeout(callback, 10), // 10ms batch window
      cacheKeyFn: (key) => String(key),
      ...config
    };

    console.log('🔄 ServiceCatalogDataLoaders initialized for tenant:', context.tenantId);
  }

  // =================================================================
  // SERVICE DATALOADERS
  // =================================================================

  /**
   * Load services by IDs - Primary service loader
   */
  get servicesByIds(): DataLoader<string, ServiceCatalogItem | null> {
    if (!this._servicesByIdsLoader) {
      this._servicesByIdsLoader = new DataLoader(
        async (serviceIds: readonly string[]) => {
          console.log(`🔄 DataLoader: Loading ${serviceIds.length} services by IDs`);
          return this.batchLoadServicesByIds(serviceIds);
        },
        {
          maxBatchSize: this.config.maxBatchSize,
          batchScheduleFn: this.config.batchScheduleFn,
          cacheKeyFn: this.config.cacheKeyFn
        }
      );
    }
    return this._servicesByIdsLoader;
  }

  private async batchLoadServicesByIds(serviceIds: readonly string[]): Promise<(ServiceCatalogItem | null)[]> {
    try {
      const environmentContext = this.createEnvironmentContext();
      
      // Use bulk query to get multiple services efficiently
      const filters = {
        service_ids: Array.from(serviceIds),
        limit: serviceIds.length
      };

      const response = await this.context.edgeFunctionClient.queryServices(filters, environmentContext);

      if (!response.success) {
        console.error('❌ Batch load services failed:', response.error);
        return serviceIds.map(() => null);
      }

      // Create a map of ID to service for efficient lookup
      const serviceMap = new Map<string, ServiceCatalogItem>();
      (response.data?.items || []).forEach((service: ServiceCatalogItem) => {
        serviceMap.set(service.id, service);
      });

      // Return services in the same order as requested IDs
      return serviceIds.map(id => serviceMap.get(id) || null);
    } catch (error) {
      console.error('❌ Batch load services error:', error);
      return serviceIds.map(() => null);
    }
  }

  /**
   * Load services by category ID
   */
  get servicesByCategory(): DataLoader<string, ServiceCatalogItem[]> {
    if (!this._servicesByCategoryLoader) {
      this._servicesByCategoryLoader = new DataLoader(
        async (categoryIds: readonly string[]) => {
          console.log(`🔄 DataLoader: Loading services for ${categoryIds.length} categories`);
          return this.batchLoadServicesByCategory(categoryIds);
        },
        {
          maxBatchSize: this.config.maxBatchSize,
          batchScheduleFn: this.config.batchScheduleFn,
          cacheKeyFn: this.config.cacheKeyFn
        }
      );
    }
    return this._servicesByCategoryLoader;
  }

  private async batchLoadServicesByCategory(categoryIds: readonly string[]): Promise<ServiceCatalogItem[][]> {
    try {
      const environmentContext = this.createEnvironmentContext();
      
      // Load services for all categories in one request
      const filters = {
        category_ids: Array.from(categoryIds),
        limit: 1000 // Large limit to get all services
      };

      const response = await this.context.edgeFunctionClient.queryServices(filters, environmentContext);

      if (!response.success) {
        console.error('❌ Batch load services by category failed:', response.error);
        return categoryIds.map(() => []);
      }

      // Group services by category ID
      const servicesByCategory = new Map<string, ServiceCatalogItem[]>();
      categoryIds.forEach(categoryId => {
        servicesByCategory.set(categoryId, []);
      });

      (response.data?.items || []).forEach((service: ServiceCatalogItem) => {
        const categoryServices = servicesByCategory.get(service.categoryId);
        if (categoryServices) {
          categoryServices.push(service);
        }
      });

      return categoryIds.map(categoryId => servicesByCategory.get(categoryId) || []);
    } catch (error) {
      console.error('❌ Batch load services by category error:', error);
      return categoryIds.map(() => []);
    }
  }

  /**
   * Load services by industry ID
   */
  get servicesByIndustry(): DataLoader<string, ServiceCatalogItem[]> {
    if (!this._servicesByIndustryLoader) {
      this._servicesByIndustryLoader = new DataLoader(
        async (industryIds: readonly string[]) => {
          console.log(`🔄 DataLoader: Loading services for ${industryIds.length} industries`);
          return this.batchLoadServicesByIndustry(industryIds);
        },
        {
          maxBatchSize: this.config.maxBatchSize,
          batchScheduleFn: this.config.batchScheduleFn,
          cacheKeyFn: this.config.cacheKeyFn
        }
      );
    }
    return this._servicesByIndustryLoader;
  }

  private async batchLoadServicesByIndustry(industryIds: readonly string[]): Promise<ServiceCatalogItem[][]> {
    try {
      const environmentContext = this.createEnvironmentContext();
      
      const filters = {
        industry_ids: Array.from(industryIds),
        limit: 1000
      };

      const response = await this.context.edgeFunctionClient.queryServices(filters, environmentContext);

      if (!response.success) {
        console.error('❌ Batch load services by industry failed:', response.error);
        return industryIds.map(() => []);
      }

      // Group services by industry ID
      const servicesByIndustry = new Map<string, ServiceCatalogItem[]>();
      industryIds.forEach(industryId => {
        servicesByIndustry.set(industryId, []);
      });

      (response.data?.items || []).forEach((service: ServiceCatalogItem) => {
        const industryServices = servicesByIndustry.get(service.industryId);
        if (industryServices) {
          industryServices.push(service);
        }
      });

      return industryIds.map(industryId => servicesByIndustry.get(industryId) || []);
    } catch (error) {
      console.error('❌ Batch load services by industry error:', error);
      return industryIds.map(() => []);
    }
  }

  // =================================================================
  // RESOURCE DATALOADERS
  // =================================================================

  /**
   * Load resources by IDs
   */
  get resourcesByIds(): DataLoader<string, AvailableResource | null> {
    if (!this._resourcesByIdsLoader) {
      this._resourcesByIdsLoader = new DataLoader(
        async (resourceIds: readonly string[]) => {
          console.log(`🔄 DataLoader: Loading ${resourceIds.length} resources by IDs`);
          return this.batchLoadResourcesByIds(resourceIds);
        },
        {
          maxBatchSize: this.config.maxBatchSize,
          batchScheduleFn: this.config.batchScheduleFn,
          cacheKeyFn: this.config.cacheKeyFn
        }
      );
    }
    return this._resourcesByIdsLoader;
  }

  private async batchLoadResourcesByIds(resourceIds: readonly string[]): Promise<(AvailableResource | null)[]> {
    try {
      const environmentContext = this.createEnvironmentContext();
      
      const filters = {
        resource_ids: Array.from(resourceIds),
        limit: resourceIds.length
      };

      const response = await this.context.edgeFunctionClient.getAvailableResources(filters, environmentContext);

      if (!response.success) {
        console.error('❌ Batch load resources failed:', response.error);
        return resourceIds.map(() => null);
      }

      const resourceMap = new Map<string, AvailableResource>();
      (response.data || []).forEach((resource: AvailableResource) => {
        resourceMap.set(resource.id, resource);
      });

      return resourceIds.map(id => resourceMap.get(id) || null);
    } catch (error) {
      console.error('❌ Batch load resources error:', error);
      return resourceIds.map(() => null);
    }
  }

  /**
   * Load resources by type
   */
  get resourcesByType(): DataLoader<string, AvailableResource[]> {
    if (!this._resourcesByTypeLoader) {
      this._resourcesByTypeLoader = new DataLoader(
        async (resourceTypes: readonly string[]) => {
          console.log(`🔄 DataLoader: Loading resources for ${resourceTypes.length} types`);
          return this.batchLoadResourcesByType(resourceTypes);
        },
        {
          maxBatchSize: this.config.maxBatchSize,
          batchScheduleFn: this.config.batchScheduleFn,
          cacheKeyFn: this.config.cacheKeyFn
        }
      );
    }
    return this._resourcesByTypeLoader;
  }

  private async batchLoadResourcesByType(resourceTypes: readonly string[]): Promise<AvailableResource[][]> {
    try {
      const environmentContext = this.createEnvironmentContext();
      
      const filters = {
        resource_types: Array.from(resourceTypes),
        limit: 1000
      };

      const response = await this.context.edgeFunctionClient.getAvailableResources(filters, environmentContext);

      if (!response.success) {
        console.error('❌ Batch load resources by type failed:', response.error);
        return resourceTypes.map(() => []);
      }

      // Group resources by type
      const resourcesByType = new Map<string, AvailableResource[]>();
      resourceTypes.forEach(type => {
        resourcesByType.set(type, []);
      });

      (response.data || []).forEach((resource: AvailableResource) => {
        const typeResources = resourcesByType.get(resource.type);
        if (typeResources) {
          typeResources.push(resource);
        }
      });

      return resourceTypes.map(type => resourcesByType.get(type) || []);
    } catch (error) {
      console.error('❌ Batch load resources by type error:', error);
      return resourceTypes.map(() => []);
    }
  }

  /**
   * Load service resource associations by service ID
   */
  get serviceResources(): DataLoader<string, ServiceResourceAssociation[]> {
    if (!this._serviceResourcesLoader) {
      this._serviceResourcesLoader = new DataLoader(
        async (serviceIds: readonly string[]) => {
          console.log(`🔄 DataLoader: Loading resource associations for ${serviceIds.length} services`);
          return this.batchLoadServiceResources(serviceIds);
        },
        {
          maxBatchSize: this.config.maxBatchSize,
          batchScheduleFn: this.config.batchScheduleFn,
          cacheKeyFn: this.config.cacheKeyFn
        }
      );
    }
    return this._serviceResourcesLoader;
  }

  private async batchLoadServiceResources(serviceIds: readonly string[]): Promise<ServiceResourceAssociation[][]> {
    try {
      const results = await Promise.allSettled(
        serviceIds.map(async (serviceId) => {
          const environmentContext = this.createEnvironmentContext();
          const response = await this.context.edgeFunctionClient.getServiceResources(serviceId, environmentContext);
          
          if (response.success && response.data?.associatedResources) {
            return response.data.associatedResources;
          }
          return [];
        })
      );

      return results.map(result => 
        result.status === 'fulfilled' ? result.value : []
      );
    } catch (error) {
      console.error('❌ Batch load service resources error:', error);
      return serviceIds.map(() => []);
    }
  }

  // =================================================================
  // MASTER DATA DATALOADERS
  // =================================================================

  /**
   * Load categories by IDs
   */
  get categoriesById(): DataLoader<string, ServiceCategory | null> {
    if (!this._categoriesByIdsLoader) {
      this._categoriesByIdsLoader = new DataLoader(
        async (categoryIds: readonly string[]) => {
          console.log(`🔄 DataLoader: Loading ${categoryIds.length} categories by IDs`);
          return this.batchLoadCategoriesById(categoryIds);
        },
        {
          maxBatchSize: this.config.maxBatchSize,
          batchScheduleFn: this.config.batchScheduleFn,
          cacheKeyFn: this.config.cacheKeyFn
        }
      );
    }
    return this._categoriesByIdsLoader;
  }

  private async batchLoadCategoriesById(categoryIds: readonly string[]): Promise<(ServiceCategory | null)[]> {
    try {
      const environmentContext = this.createEnvironmentContext();
      const response = await this.context.edgeFunctionClient.getMasterData(environmentContext);

      if (!response.success || !response.data?.categories) {
        console.error('❌ Batch load categories failed:', response.error);
        return categoryIds.map(() => null);
      }

      const categoryMap = new Map<string, ServiceCategory>();
      response.data.categories.forEach((category: ServiceCategory) => {
        categoryMap.set(category.id, category);
      });

      return categoryIds.map(id => categoryMap.get(id) || null);
    } catch (error) {
      console.error('❌ Batch load categories error:', error);
      return categoryIds.map(() => null);
    }
  }

  /**
   * Load industries by IDs
   */
  get industriesById(): DataLoader<string, ServiceIndustry | null> {
    if (!this._industriesByIdsLoader) {
      this._industriesByIdsLoader = new DataLoader(
        async (industryIds: readonly string[]) => {
          console.log(`🔄 DataLoader: Loading ${industryIds.length} industries by IDs`);
          return this.batchLoadIndustriesById(industryIds);
        },
        {
          maxBatchSize: this.config.maxBatchSize,
          batchScheduleFn: this.config.batchScheduleFn,
          cacheKeyFn: this.config.cacheKeyFn
        }
      );
    }
    return this._industriesByIdsLoader;
  }

  private async batchLoadIndustriesById(industryIds: readonly string[]): Promise<(ServiceIndustry | null)[]> {
    try {
      const environmentContext = this.createEnvironmentContext();
      const response = await this.context.edgeFunctionClient.getMasterData(environmentContext);

      if (!response.success || !response.data?.industries) {
        console.error('❌ Batch load industries failed:', response.error);
        return industryIds.map(() => null);
      }

      const industryMap = new Map<string, ServiceIndustry>();
      response.data.industries.forEach((industry: ServiceIndustry) => {
        industryMap.set(industry.id, industry);
      });

      return industryIds.map(id => industryMap.get(id) || null);
    } catch (error) {
      console.error('❌ Batch load industries error:', error);
      return industryIds.map(() => null);
    }
  }

  /**
   * Load currencies by codes
   */
  get currenciesByCodes(): DataLoader<string, CurrencyOption | null> {
    if (!this._currenciesByCodesLoader) {
      this._currenciesByCodesLoader = new DataLoader(
        async (currencyCodes: readonly string[]) => {
          console.log(`🔄 DataLoader: Loading ${currencyCodes.length} currencies by codes`);
          return this.batchLoadCurrenciesByCodes(currencyCodes);
        },
        {
          maxBatchSize: this.config.maxBatchSize,
          batchScheduleFn: this.config.batchScheduleFn,
          cacheKeyFn: this.config.cacheKeyFn
        }
      );
    }
    return this._currenciesByCodesLoader;
  }

  private async batchLoadCurrenciesByCodes(currencyCodes: readonly string[]): Promise<(CurrencyOption | null)[]> {
    try {
      const environmentContext = this.createEnvironmentContext();
      const response = await this.context.edgeFunctionClient.getMasterData(environmentContext);

      if (!response.success || !response.data?.currencies) {
        console.error('❌ Batch load currencies failed:', response.error);
        return currencyCodes.map(() => null);
      }

      const currencyMap = new Map<string, CurrencyOption>();
      response.data.currencies.forEach((currency: CurrencyOption) => {
        currencyMap.set(currency.code, currency);
      });

      return currencyCodes.map(code => currencyMap.get(code) || null);
    } catch (error) {
      console.error('❌ Batch load currencies error:', error);
      return currencyCodes.map(() => null);
    }
  }

  /**
   * Load tax rates by IDs
   */
  get taxRatesById(): DataLoader<string, TaxRateOption | null> {
    if (!this._taxRatesByIdsLoader) {
      this._taxRatesByIdsLoader = new DataLoader(
        async (taxRateIds: readonly string[]) => {
          console.log(`🔄 DataLoader: Loading ${taxRateIds.length} tax rates by IDs`);
          return this.batchLoadTaxRatesById(taxRateIds);
        },
        {
          maxBatchSize: this.config.maxBatchSize,
          batchScheduleFn: this.config.batchScheduleFn,
          cacheKeyFn: this.config.cacheKeyFn
        }
      );
    }
    return this._taxRatesByIdsLoader;
  }

  private async batchLoadTaxRatesById(taxRateIds: readonly string[]): Promise<(TaxRateOption | null)[]> {
    try {
      const environmentContext = this.createEnvironmentContext();
      const response = await this.context.edgeFunctionClient.getMasterData(environmentContext);

      if (!response.success || !response.data?.taxRates) {
        console.error('❌ Batch load tax rates failed:', response.error);
        return taxRateIds.map(() => null);
      }

      const taxRateMap = new Map<string, TaxRateOption>();
      response.data.taxRates.forEach((taxRate: TaxRateOption) => {
        taxRateMap.set(taxRate.id, taxRate);
      });

      return taxRateIds.map(id => taxRateMap.get(id) || null);
    } catch (error) {
      console.error('❌ Batch load tax rates error:', error);
      return taxRateIds.map(() => null);
    }
  }

  /**
   * Load service pricing history by service ID
   */
  get servicePricingHistory(): DataLoader<string, ServicePricingHistory[]> {
    if (!this._servicePricingHistoryLoader) {
      this._servicePricingHistoryLoader = new DataLoader(
        async (serviceIds: readonly string[]) => {
          console.log(`🔄 DataLoader: Loading pricing history for ${serviceIds.length} services`);
          return this.batchLoadServicePricingHistory(serviceIds);
        },
        {
          maxBatchSize: this.config.maxBatchSize,
          batchScheduleFn: this.config.batchScheduleFn,
          cacheKeyFn: this.config.cacheKeyFn
        }
      );
    }
    return this._servicePricingHistoryLoader;
  }

  private async batchLoadServicePricingHistory(serviceIds: readonly string[]): Promise<ServicePricingHistory[][]> {
    try {
      // For now, return empty arrays as pricing history would require a separate endpoint
      // TODO: Implement when pricing history endpoint is available
      return serviceIds.map(() => []);
    } catch (error) {
      console.error('❌ Batch load service pricing history error:', error);
      return serviceIds.map(() => []);
    }
  }

  // =================================================================
  // UTILITY METHODS
  // =================================================================

  private createEnvironmentContext(): any {
    return {
      tenant_id: this.context.tenantId,
      user_id: this.context.userId,
      is_live: this.context.isLive,
      request_id: this.context.requestId
    };
  }

  // =================================================================
  // CACHE MANAGEMENT
  // =================================================================

  /**
   * Clear all DataLoader caches
   */
  clearAll(): void {
    console.log('🗑️ Clearing all ServiceCatalog DataLoader caches');
    
    this._servicesByIdsLoader?.clearAll();
    this._categoriesByIdsLoader?.clearAll();
    this._industriesByIdsLoader?.clearAll();
    this._resourcesByIdsLoader?.clearAll();
    this._serviceResourcesLoader?.clearAll();
    this._servicePricingHistoryLoader?.clearAll();
    this._currenciesByCodesLoader?.clearAll();
    this._taxRatesByIdsLoader?.clearAll();
    this._servicesByCategoryLoader?.clearAll();
    this._servicesByIndustryLoader?.clearAll();
    this._resourcesByTypeLoader?.clearAll();
  }

  /**
   * Clear specific service from cache
   */
  clearService(serviceId: string): void {
    console.log(`🗑️ Clearing service ${serviceId} from DataLoader caches`);
    this._servicesByIdsLoader?.clear(serviceId);
  }

  /**
   * Clear specific resource from cache
   */
  clearResource(resourceId: string): void {
    console.log(`🗑️ Clearing resource ${resourceId} from DataLoader caches`);
    this._resourcesByIdsLoader?.clear(resourceId);
  }

  /**
   * Clear category-related caches
   */
  clearCategory(categoryId: string): void {
    console.log(`🗑️ Clearing category ${categoryId} from DataLoader caches`);
    this._categoriesByIdsLoader?.clear(categoryId);
    this._servicesByCategoryLoader?.clear(categoryId);
  }

  /**
   * Clear industry-related caches
   */
  clearIndustry(industryId: string): void {
    console.log(`🗑️ Clearing industry ${industryId} from DataLoader caches`);
    this._industriesByIdsLoader?.clear(industryId);
    this._servicesByIndustryLoader?.clear(industryId);
  }

  // =================================================================
  // PERFORMANCE MONITORING
  // =================================================================

  /**
   * Get DataLoader performance statistics
   */
  getPerformanceStats(): {
    totalCacheSize: number;
    averageBatchSize: number;
    cacheHitRates: Record<string, number>;
  } {
    return {
      totalCacheSize: this.getTotalCacheSize(),
      averageBatchSize: 0, // TODO: Implement batch size tracking
      cacheHitRates: {
        services: 0, // TODO: Implement cache hit rate tracking
        resources: 0,
        categories: 0,
        industries: 0,
        currencies: 0,
        taxRates: 0
      }
    };
  }

  private getTotalCacheSize(): number {
    let totalSize = 0;
    
    // Approximate cache sizes (DataLoader doesn't expose cache size directly)
    const loaders = [
      this._servicesByIdsLoader,
      this._categoriesByIdsLoader,
      this._industriesByIdsLoader,
      this._resourcesByIdsLoader,
      this._serviceResourcesLoader,
      this._servicePricingHistoryLoader,
      this._currenciesByCodesLoader,
      this._taxRatesByIdsLoader,
      this._servicesByCategoryLoader,
      this._servicesByIndustryLoader,
      this._resourcesByTypeLoader
    ];

    // This is an approximation - DataLoader doesn't expose internal cache size
    loaders.forEach(loader => {
      if (loader) {
        totalSize += 1; // Placeholder - actual implementation would need custom cache tracking
      }
    });

    return totalSize;
  }
}

// =================================================================
// FACTORY FUNCTIONS
// =================================================================

/**
 * Create ServiceCatalog DataLoaders for a GraphQL context
 */
export function createServiceCatalogDataLoaders(
  context: ServiceCatalogDataLoaderContext,
  config?: DataLoaderConfig
): ServiceCatalogDataLoaders {
  return new ServiceCatalogDataLoaders(context, config);
}

/**
 * Create DataLoaders with custom configuration for high-performance scenarios
 */
export function createHighPerformanceDataLoaders(
  context: ServiceCatalogDataLoaderContext
): ServiceCatalogDataLoaders {
  return new ServiceCatalogDataLoaders(context, {
    maxBatchSize: 200, // Larger batch size
    batchScheduleFn: (callback) => setTimeout(callback, 5), // Shorter batch window
    cacheMap: new Map() // Use custom cache
  });
}

/**
 * Create DataLoaders with aggressive caching for read-heavy scenarios
 */
export function createCachingDataLoaders(
  context: ServiceCatalogDataLoaderContext
): ServiceCatalogDataLoaders {
  return new ServiceCatalogDataLoaders(context, {
    maxBatchSize: 50,
    batchScheduleFn: (callback) => setTimeout(callback, 20), // Longer batch window
    cacheMap: new Map() // Persistent cache
  });
}

export default ServiceCatalogDataLoaders;