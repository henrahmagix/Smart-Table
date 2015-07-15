/** 
* @version 2.1.0
* @license MIT
*/
(function (ng, undefined){
    'use strict';

ng.module('smart-table', []).run(['$templateCache', function ($templateCache) {
    $templateCache.put('template/smart-table/pagination.html',
        '<nav ng-if="numPages && pages.length >= 2"><ul class="pagination">' +
        '<li ng-repeat="page in pages" ng-class="{active: page==currentPage}"><a ng-click="selectPage(page)">{{page}}</a></li>' +
        '</ul></nav>');
}]);


ng.module('smart-table')
  .constant('stConfig', {
    pagination: {
      template: 'template/smart-table/pagination.html',
      itemsByPage: 10,
      displayedPages: 5
    },
    search: {
      delay: 400, // ms
      inputEvent: 'input'
    },
    select: {
      mode: 'single',
      selectedClass: 'st-selected'
    },
    sort: {
      ascentClass: 'st-sort-ascent',
      descentClass: 'st-sort-descent',
      skipNatural: false
    },
    pipe: {
      delay: 100 //ms
    }
  });
ng.module('smart-table')
  .controller('stTableController', ['$scope', '$parse', '$filter', '$attrs', function StTableController ($scope, $parse, $filter, $attrs) {
    var propertyName = $attrs.stTable;
    var displayGetter = $parse(propertyName);
    var displaySetter = displayGetter.assign;
    var safeGetter;
    var orderBy = $filter('orderBy');
    var filter = $filter('filter');
    var safeCopy = copyRefs(displayGetter($scope));
    var tableState = {
      sort: {},
      search: {},
      pagination: {
        start: 0
      }
    };
    var filtered;
    var pipeAfterSafeCopy = true;
    var ctrl = this;
    var lastSelected;

    function copyRefs (src) {
      return src ? [].concat(src) : [];
    }

    function updateSafeCopy () {
      safeCopy = copyRefs(safeGetter($scope));
      if (pipeAfterSafeCopy === true) {
        ctrl.pipe();
      }
    }

    function deepDelete(object, path) {
      if (path.indexOf('.') != -1) {
          var partials = path.split('.');
          var key = partials.pop();
          var parentPath = partials.join('.');
          var parentObject = $parse(parentPath)(object)
          delete parentObject[key];
          if (Object.keys(parentObject).length == 0) {
            deepDelete(object, parentPath);
          }
        } else {
          delete object[path];
        }
    }

    if ($attrs.stSafeSrc) {
      safeGetter = $parse($attrs.stSafeSrc);
      $scope.$watch(function () {
        var safeSrc = safeGetter($scope);
        return safeSrc ? safeSrc.length : 0;

      }, function (newValue, oldValue) {
        if (newValue !== safeCopy.length) {
          updateSafeCopy();
        }
      });
      $scope.$watch(function () {
        return safeGetter($scope);
      }, function (newValue, oldValue) {
        if (newValue !== oldValue) {
          updateSafeCopy();
        }
      });
    }

    /**
     * sort the rows
     * @param {Function | String} predicate - function or string which will be used as predicate for the sorting
     * @param [reverse] - if you want to reverse the order
     */
    this.sortBy = function sortBy (predicate, reverse) {
      tableState.sort.predicate = predicate;
      tableState.sort.reverse = reverse === true;

      if (ng.isFunction(predicate)) {
        tableState.sort.functionName = predicate.name;
      } else {
        delete tableState.sort.functionName;
      }

      tableState.pagination.start = 0;
      return this.pipe();
    };

    /**
     * search matching rows
     * @param {String} input - the input string
     * @param {String} [predicate] - the property name against you want to check the match, otherwise it will search on all properties
     */
    this.search = function search (input, predicate) {
      var predicateObject = tableState.search.predicateObject || {};
      var prop = predicate ? predicate : '$';

      input = ng.isString(input) ? input.trim() : input;
      $parse(prop).assign(predicateObject, input);
      // to avoid to filter out null value
      if (!input) {
        deepDelete(predicateObject, prop);
      }
      tableState.search.predicateObject = predicateObject;
      tableState.pagination.start = 0;
      return this.pipe();
    };

    this.pipeSearch = function pipeSearch (tableState, filtered) {
      return tableState.search.predicateObject ? filter(filtered, tableState.search.predicateObject) : filtered;
    };

    this.pipeSort = function pipeSort (tableState, filtered) {
      if (tableState.sort.predicate) {
        filtered = orderBy(filtered, tableState.sort.predicate, tableState.sort.reverse);
      }
      return filtered;
    };

    this.pipePagination = function pipePagination (tableState, filtered) {
      var pagination = tableState.pagination;
      var output;
      if (pagination.number !== undefined) {
        pagination.numberOfPages = filtered.length > 0 ? Math.ceil(filtered.length / pagination.number) : 1;
        pagination.start = pagination.start >= filtered.length ? (pagination.numberOfPages - 1) * pagination.number : pagination.start;
        output = filtered.slice(pagination.start, pagination.start + parseInt(pagination.number));
      }
      return output || filtered;
    };

    /**
     * this will chain the operations of sorting and filtering based on the current table state (sort options, filtering, ect)
     */
    this.pipe = function pipe () {
      var pagination = tableState.pagination;
      filtered = this.safeCopy();
      if (ng.isFunction(this.pipePre)) {
        filtered = this.pipePre(tableState, filtered);
      }
      filtered = this.pipeSearch(tableState, filtered);
      filtered = this.pipeSort(tableState, filtered);
      filtered = this.pipePagination(tableState, filtered);
      if (ng.isFunction(this.pipePost)) {
        filtered = this.pipePost(tableState, filtered);
      }
      displaySetter($scope, filtered);
    };

    /**
     * select a dataRow (it will add the attribute isSelected to the row object)
     * @param {Object} row - the row to select
     * @param {String} [mode] - "single" or "multiple" (multiple by default)
     */
    this.select = function select (row, mode) {
      var rows = copyRefs(displayGetter($scope));
      var index = rows.indexOf(row);
      if (index !== -1) {
        if (mode === 'single') {
          row.isSelected = row.isSelected !== true;
          if (lastSelected) {
            lastSelected.isSelected = false;
          }
          lastSelected = row.isSelected === true ? row : undefined;
        } else {
          rows[index].isSelected = !rows[index].isSelected;
        }
      }
    };

    /**
     * take a slice of the current sorted/filtered collection (pagination)
     *
     * @param {Number} start - start index of the slice
     * @param {Number} number - the number of item in the slice
     */
    this.slice = function splice (start, number) {
      tableState.pagination.start = start;
      tableState.pagination.number = number;
      return this.pipe();
    };

    /**
     * return the current state of the table
     * @returns {{sort: {}, search: {}, pagination: {start: number}}}
     */
    this.tableState = function getTableState () {
      return tableState;
    };

    this.safeCopy = function getSafeCopy () {
      return safeCopy;
    };

    this.getFilteredCollection = function getFilteredCollection () {
      return filtered || safeCopy;
    };

    /**
     * Use a different filter function than the angular FilterFilter
     * @param filterName the name under which the custom filter is registered
     */
    this.setFilterFunction = function setFilterFunction (filterName) {
      filter = $filter(filterName);
    };

    /**
     * Use a different function than the angular orderBy
     * @param sortFunctionName the name under which the custom order function is registered
     */
    this.setSortFunction = function setSortFunction (sortFunctionName) {
      orderBy = $filter(sortFunctionName);
    };

    /**
     * Usually when the safe copy is updated the pipe function is called.
     * Calling this method will prevent it, which is something required when using a custom pipe function
     */
    this.preventPipeOnWatch = function preventPipe () {
      pipeAfterSafeCopy = false;
    };
  }])
  .directive('stTable', function () {
    return {
      restrict: 'A',
      controller: 'stTableController',
      link: function (scope, element, attr, ctrl) {

        if (attr.stSetFilter) {
          ctrl.setFilterFunction(attr.stSetFilter);
        }

        if (attr.stSetSort) {
          ctrl.setSortFunction(attr.stSetSort);
        }
      }
    };
  });

ng.module('smart-table')
  .directive('stSearch', ['stConfig', '$timeout','$parse', function (stConfig, $timeout, $parse) {
    return {
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {
        var tableCtrl = ctrl;
        var promise = null;
        var throttle = attr.stDelay || stConfig.search.delay;
        var event = attr.stInputEvent || stConfig.search.inputEvent;

        attr.$observe('stSearch', function (newValue, oldValue) {
          var input = element[0].value;
          if (newValue !== oldValue && input) {
            ctrl.tableState().search = {};
            tableCtrl.search(input, newValue);
          }
        });

        //table state -> view
        scope.$watch(function () {
          return ctrl.tableState().search;
        }, function (newValue, oldValue) {
          var predicateExpression = attr.stSearch || '$';
          if (newValue.predicateObject && $parse(predicateExpression)(newValue.predicateObject) !== element[0].value) {
            element[0].value = $parse(predicateExpression)(newValue.predicateObject) || '';
          }
        }, true);

        // view -> table state
        element.bind(event, function (evt) {
          evt = evt.originalEvent || evt;
          if (promise !== null) {
            $timeout.cancel(promise);
          }

          promise = $timeout(function () {
            tableCtrl.search(evt.target.value, attr.stSearch || '');
            promise = null;
          }, throttle);
        });
      }
    };
  }]);

ng.module('smart-table')
  .directive('stSelectRow', ['stConfig', function (stConfig) {
    return {
      restrict: 'A',
      require: '^stTable',
      scope: {
        row: '=stSelectRow'
      },
      link: function (scope, element, attr, ctrl) {
        var mode = attr.stSelectMode || stConfig.select.mode;
        element.bind('click', function () {
          scope.$apply(function () {
            ctrl.select(scope.row, mode);
          });
        });

        scope.$watch('row.isSelected', function (newValue) {
          if (newValue === true) {
            element.addClass(stConfig.select.selectedClass);
          } else {
            element.removeClass(stConfig.select.selectedClass);
          }
        });
      }
    };
  }]);

ng.module('smart-table')
  .directive('stSort', ['stConfig', '$parse', function (stConfig, $parse) {
    return {
      restrict: 'A',
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {

        var predicate = attr.stSort;
        var getter = $parse(predicate);
        var index = 0;
        var classAscent = attr.stClassAscent || stConfig.sort.ascentClass;
        var classDescent = attr.stClassDescent || stConfig.sort.descentClass;
        var stateClasses = [classAscent, classDescent];
        var sortDefault;
        var skipNatural = attr.stSkipNatural !== undefined ? attr.stSkipNatural : stConfig.sort.skipNatural;

        if (attr.stSortDefault) {
          sortDefault = scope.$eval(attr.stSortDefault) !== undefined ? scope.$eval(attr.stSortDefault) : attr.stSortDefault;
        }

        //view --> table state
        function sort () {
          index++;
          predicate = ng.isFunction(getter(scope)) ? getter(scope) : attr.stSort;
          if (index % 3 === 0 && !!skipNatural !== true) {
            //manual reset
            index = 0;
            ctrl.tableState().sort = {};
            ctrl.tableState().pagination.start = 0;
            ctrl.pipe();
          } else {
            ctrl.sortBy(predicate, index % 2 === 0);
          }
        }

        element.bind('click', function sortClick () {
          if (predicate) {
            scope.$apply(sort);
          }
        });

        if (sortDefault) {
          index = sortDefault === 'reverse' ? 1 : 0;
          sort();
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().sort;
        }, function (newValue) {
          if (newValue.predicate !== predicate) {
            index = 0;
            element
              .removeClass(classAscent)
              .removeClass(classDescent);
          } else {
            index = newValue.reverse === true ? 2 : 1;
            element
              .removeClass(stateClasses[index % 2])
              .addClass(stateClasses[index - 1]);
          }
        }, true);
      }
    };
  }]);

ng.module('smart-table')
  .directive('stPagination', ['stConfig', function (stConfig) {
    return {
      restrict: 'EA',
      require: '^stTable',
      scope: {
        stItemsByPage: '=?',
        stDisplayedPages: '=?',
        stPageChange: '&'
      },
      templateUrl: function (element, attrs) {
        if (attrs.stTemplate) {
          return attrs.stTemplate;
        }
        return stConfig.pagination.template;
      },
      link: function (scope, element, attrs, ctrl) {

        scope.stItemsByPage = scope.stItemsByPage ? +(scope.stItemsByPage) : stConfig.pagination.itemsByPage;
        scope.stDisplayedPages = scope.stDisplayedPages ? +(scope.stDisplayedPages) : stConfig.pagination.displayedPages;

        scope.currentPage = 1;
        scope.pages = [];

        function redraw () {
          var paginationState = ctrl.tableState().pagination;
          var start = 1;
          var end;
          var i;
          var prevPage = scope.currentPage;
          scope.currentPage = Math.floor(paginationState.start / paginationState.number) + 1;

          start = Math.max(start, scope.currentPage - Math.abs(Math.floor(scope.stDisplayedPages / 2)));
          end = start + scope.stDisplayedPages;

          if (end > paginationState.numberOfPages) {
            end = paginationState.numberOfPages + 1;
            start = Math.max(1, end - scope.stDisplayedPages);
          }

          scope.pages = [];
          scope.numPages = paginationState.numberOfPages;

          for (i = start; i < end; i++) {
            scope.pages.push(i);
          }

          if (prevPage !== scope.currentPage) {
            scope.stPageChange({newPage: scope.currentPage});
          }
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().pagination;
        }, redraw, true);

        //scope --> table state  (--> view)
        scope.$watch('stItemsByPage', function (newValue, oldValue) {
          if (newValue !== oldValue) {
            scope.selectPage(1);
          }
        });

        scope.$watch('stDisplayedPages', redraw);

        //view -> table state
        scope.selectPage = function (page) {
          if (page > 0 && page <= scope.numPages) {
            ctrl.slice((page - 1) * scope.stItemsByPage, scope.stItemsByPage);
          }
        };

        if (!ctrl.tableState().pagination.number) {
          ctrl.slice(0, scope.stItemsByPage);
        }
      }
    };
  }]);

ng.module('smart-table')
  .directive('stPipe', ['stConfig', '$timeout', function (config, $timeout) {
    return {
      require: 'stTable',
      scope: {
        stPipe: '='
      },
      link: {

        pre: function (scope, element, attrs, ctrl) {

          var pipePromise = null;

          if (ng.isFunction(scope.stPipe)) {
            ctrl.preventPipeOnWatch();
            ctrl.pipe = function () {

              if (pipePromise !== null) {
                $timeout.cancel(pipePromise)
              }

              pipePromise = $timeout(function () {
                scope.stPipe(ctrl.tableState(), ctrl);
              }, config.pipe.delay);

              return pipePromise;
            }
          }
        },

        post: function (scope, element, attrs, ctrl) {
          ctrl.pipe();
        }
      }
    };
  }]);

})(angular);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy90b3AudHh0Iiwic3JjL3NtYXJ0LXRhYmxlLm1vZHVsZS5qcyIsInNyYy9zdENvbmZpZy5qcyIsInNyYy9zdFRhYmxlLmpzIiwic3JjL3N0U2VhcmNoLmpzIiwic3JjL3N0U2VsZWN0Um93LmpzIiwic3JjL3N0U29ydC5qcyIsInNyYy9zdFBhZ2luYXRpb24uanMiLCJzcmMvc3RQaXBlLmpzIiwic3JjL2JvdHRvbS50eHQiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FDRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDM09BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDL0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcENBIiwiZmlsZSI6InNtYXJ0LXRhYmxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIChuZywgdW5kZWZpbmVkKXtcbiAgICAndXNlIHN0cmljdCc7XG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJywgW10pLnJ1bihbJyR0ZW1wbGF0ZUNhY2hlJywgZnVuY3Rpb24gKCR0ZW1wbGF0ZUNhY2hlKSB7XG4gICAgJHRlbXBsYXRlQ2FjaGUucHV0KCd0ZW1wbGF0ZS9zbWFydC10YWJsZS9wYWdpbmF0aW9uLmh0bWwnLFxuICAgICAgICAnPG5hdiBuZy1pZj1cIm51bVBhZ2VzICYmIHBhZ2VzLmxlbmd0aCA+PSAyXCI+PHVsIGNsYXNzPVwicGFnaW5hdGlvblwiPicgK1xuICAgICAgICAnPGxpIG5nLXJlcGVhdD1cInBhZ2UgaW4gcGFnZXNcIiBuZy1jbGFzcz1cInthY3RpdmU6IHBhZ2U9PWN1cnJlbnRQYWdlfVwiPjxhIG5nLWNsaWNrPVwic2VsZWN0UGFnZShwYWdlKVwiPnt7cGFnZX19PC9hPjwvbGk+JyArXG4gICAgICAgICc8L3VsPjwvbmF2PicpO1xufV0pO1xuXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcbiAgLmNvbnN0YW50KCdzdENvbmZpZycsIHtcbiAgICBwYWdpbmF0aW9uOiB7XG4gICAgICB0ZW1wbGF0ZTogJ3RlbXBsYXRlL3NtYXJ0LXRhYmxlL3BhZ2luYXRpb24uaHRtbCcsXG4gICAgICBpdGVtc0J5UGFnZTogMTAsXG4gICAgICBkaXNwbGF5ZWRQYWdlczogNVxuICAgIH0sXG4gICAgc2VhcmNoOiB7XG4gICAgICBkZWxheTogNDAwLCAvLyBtc1xuICAgICAgaW5wdXRFdmVudDogJ2lucHV0J1xuICAgIH0sXG4gICAgc2VsZWN0OiB7XG4gICAgICBtb2RlOiAnc2luZ2xlJyxcbiAgICAgIHNlbGVjdGVkQ2xhc3M6ICdzdC1zZWxlY3RlZCdcbiAgICB9LFxuICAgIHNvcnQ6IHtcbiAgICAgIGFzY2VudENsYXNzOiAnc3Qtc29ydC1hc2NlbnQnLFxuICAgICAgZGVzY2VudENsYXNzOiAnc3Qtc29ydC1kZXNjZW50JyxcbiAgICAgIHNraXBOYXR1cmFsOiBmYWxzZVxuICAgIH0sXG4gICAgcGlwZToge1xuICAgICAgZGVsYXk6IDEwMCAvL21zXG4gICAgfVxuICB9KTsiLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcbiAgLmNvbnRyb2xsZXIoJ3N0VGFibGVDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJHBhcnNlJywgJyRmaWx0ZXInLCAnJGF0dHJzJywgZnVuY3Rpb24gU3RUYWJsZUNvbnRyb2xsZXIgKCRzY29wZSwgJHBhcnNlLCAkZmlsdGVyLCAkYXR0cnMpIHtcbiAgICB2YXIgcHJvcGVydHlOYW1lID0gJGF0dHJzLnN0VGFibGU7XG4gICAgdmFyIGRpc3BsYXlHZXR0ZXIgPSAkcGFyc2UocHJvcGVydHlOYW1lKTtcbiAgICB2YXIgZGlzcGxheVNldHRlciA9IGRpc3BsYXlHZXR0ZXIuYXNzaWduO1xuICAgIHZhciBzYWZlR2V0dGVyO1xuICAgIHZhciBvcmRlckJ5ID0gJGZpbHRlcignb3JkZXJCeScpO1xuICAgIHZhciBmaWx0ZXIgPSAkZmlsdGVyKCdmaWx0ZXInKTtcbiAgICB2YXIgc2FmZUNvcHkgPSBjb3B5UmVmcyhkaXNwbGF5R2V0dGVyKCRzY29wZSkpO1xuICAgIHZhciB0YWJsZVN0YXRlID0ge1xuICAgICAgc29ydDoge30sXG4gICAgICBzZWFyY2g6IHt9LFxuICAgICAgcGFnaW5hdGlvbjoge1xuICAgICAgICBzdGFydDogMFxuICAgICAgfVxuICAgIH07XG4gICAgdmFyIGZpbHRlcmVkO1xuICAgIHZhciBwaXBlQWZ0ZXJTYWZlQ29weSA9IHRydWU7XG4gICAgdmFyIGN0cmwgPSB0aGlzO1xuICAgIHZhciBsYXN0U2VsZWN0ZWQ7XG5cbiAgICBmdW5jdGlvbiBjb3B5UmVmcyAoc3JjKSB7XG4gICAgICByZXR1cm4gc3JjID8gW10uY29uY2F0KHNyYykgOiBbXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1cGRhdGVTYWZlQ29weSAoKSB7XG4gICAgICBzYWZlQ29weSA9IGNvcHlSZWZzKHNhZmVHZXR0ZXIoJHNjb3BlKSk7XG4gICAgICBpZiAocGlwZUFmdGVyU2FmZUNvcHkgPT09IHRydWUpIHtcbiAgICAgICAgY3RybC5waXBlKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGVlcERlbGV0ZShvYmplY3QsIHBhdGgpIHtcbiAgICAgIGlmIChwYXRoLmluZGV4T2YoJy4nKSAhPSAtMSkge1xuICAgICAgICAgIHZhciBwYXJ0aWFscyA9IHBhdGguc3BsaXQoJy4nKTtcbiAgICAgICAgICB2YXIga2V5ID0gcGFydGlhbHMucG9wKCk7XG4gICAgICAgICAgdmFyIHBhcmVudFBhdGggPSBwYXJ0aWFscy5qb2luKCcuJyk7XG4gICAgICAgICAgdmFyIHBhcmVudE9iamVjdCA9ICRwYXJzZShwYXJlbnRQYXRoKShvYmplY3QpXG4gICAgICAgICAgZGVsZXRlIHBhcmVudE9iamVjdFtrZXldO1xuICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhwYXJlbnRPYmplY3QpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICBkZWVwRGVsZXRlKG9iamVjdCwgcGFyZW50UGF0aCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRlbGV0ZSBvYmplY3RbcGF0aF07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoJGF0dHJzLnN0U2FmZVNyYykge1xuICAgICAgc2FmZUdldHRlciA9ICRwYXJzZSgkYXR0cnMuc3RTYWZlU3JjKTtcbiAgICAgICRzY29wZS4kd2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgc2FmZVNyYyA9IHNhZmVHZXR0ZXIoJHNjb3BlKTtcbiAgICAgICAgcmV0dXJuIHNhZmVTcmMgPyBzYWZlU3JjLmxlbmd0aCA6IDA7XG5cbiAgICAgIH0sIGZ1bmN0aW9uIChuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcbiAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBzYWZlQ29weS5sZW5ndGgpIHtcbiAgICAgICAgICB1cGRhdGVTYWZlQ29weSgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgICRzY29wZS4kd2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gc2FmZUdldHRlcigkc2NvcGUpO1xuICAgICAgfSwgZnVuY3Rpb24gKG5ld1ZhbHVlLCBvbGRWYWx1ZSkge1xuICAgICAgICBpZiAobmV3VmFsdWUgIT09IG9sZFZhbHVlKSB7XG4gICAgICAgICAgdXBkYXRlU2FmZUNvcHkoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogc29ydCB0aGUgcm93c1xuICAgICAqIEBwYXJhbSB7RnVuY3Rpb24gfCBTdHJpbmd9IHByZWRpY2F0ZSAtIGZ1bmN0aW9uIG9yIHN0cmluZyB3aGljaCB3aWxsIGJlIHVzZWQgYXMgcHJlZGljYXRlIGZvciB0aGUgc29ydGluZ1xuICAgICAqIEBwYXJhbSBbcmV2ZXJzZV0gLSBpZiB5b3Ugd2FudCB0byByZXZlcnNlIHRoZSBvcmRlclxuICAgICAqL1xuICAgIHRoaXMuc29ydEJ5ID0gZnVuY3Rpb24gc29ydEJ5IChwcmVkaWNhdGUsIHJldmVyc2UpIHtcbiAgICAgIHRhYmxlU3RhdGUuc29ydC5wcmVkaWNhdGUgPSBwcmVkaWNhdGU7XG4gICAgICB0YWJsZVN0YXRlLnNvcnQucmV2ZXJzZSA9IHJldmVyc2UgPT09IHRydWU7XG5cbiAgICAgIGlmIChuZy5pc0Z1bmN0aW9uKHByZWRpY2F0ZSkpIHtcbiAgICAgICAgdGFibGVTdGF0ZS5zb3J0LmZ1bmN0aW9uTmFtZSA9IHByZWRpY2F0ZS5uYW1lO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVsZXRlIHRhYmxlU3RhdGUuc29ydC5mdW5jdGlvbk5hbWU7XG4gICAgICB9XG5cbiAgICAgIHRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IDA7XG4gICAgICByZXR1cm4gdGhpcy5waXBlKCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIHNlYXJjaCBtYXRjaGluZyByb3dzXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IC0gdGhlIGlucHV0IHN0cmluZ1xuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBbcHJlZGljYXRlXSAtIHRoZSBwcm9wZXJ0eSBuYW1lIGFnYWluc3QgeW91IHdhbnQgdG8gY2hlY2sgdGhlIG1hdGNoLCBvdGhlcndpc2UgaXQgd2lsbCBzZWFyY2ggb24gYWxsIHByb3BlcnRpZXNcbiAgICAgKi9cbiAgICB0aGlzLnNlYXJjaCA9IGZ1bmN0aW9uIHNlYXJjaCAoaW5wdXQsIHByZWRpY2F0ZSkge1xuICAgICAgdmFyIHByZWRpY2F0ZU9iamVjdCA9IHRhYmxlU3RhdGUuc2VhcmNoLnByZWRpY2F0ZU9iamVjdCB8fCB7fTtcbiAgICAgIHZhciBwcm9wID0gcHJlZGljYXRlID8gcHJlZGljYXRlIDogJyQnO1xuXG4gICAgICBpbnB1dCA9IG5nLmlzU3RyaW5nKGlucHV0KSA/IGlucHV0LnRyaW0oKSA6IGlucHV0O1xuICAgICAgJHBhcnNlKHByb3ApLmFzc2lnbihwcmVkaWNhdGVPYmplY3QsIGlucHV0KTtcbiAgICAgIC8vIHRvIGF2b2lkIHRvIGZpbHRlciBvdXQgbnVsbCB2YWx1ZVxuICAgICAgaWYgKCFpbnB1dCkge1xuICAgICAgICBkZWVwRGVsZXRlKHByZWRpY2F0ZU9iamVjdCwgcHJvcCk7XG4gICAgICB9XG4gICAgICB0YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgPSBwcmVkaWNhdGVPYmplY3Q7XG4gICAgICB0YWJsZVN0YXRlLnBhZ2luYXRpb24uc3RhcnQgPSAwO1xuICAgICAgcmV0dXJuIHRoaXMucGlwZSgpO1xuICAgIH07XG5cbiAgICB0aGlzLnBpcGVTZWFyY2ggPSBmdW5jdGlvbiBwaXBlU2VhcmNoICh0YWJsZVN0YXRlLCBmaWx0ZXJlZCkge1xuICAgICAgcmV0dXJuIHRhYmxlU3RhdGUuc2VhcmNoLnByZWRpY2F0ZU9iamVjdCA/IGZpbHRlcihmaWx0ZXJlZCwgdGFibGVTdGF0ZS5zZWFyY2gucHJlZGljYXRlT2JqZWN0KSA6IGZpbHRlcmVkO1xuICAgIH07XG5cbiAgICB0aGlzLnBpcGVTb3J0ID0gZnVuY3Rpb24gcGlwZVNvcnQgKHRhYmxlU3RhdGUsIGZpbHRlcmVkKSB7XG4gICAgICBpZiAodGFibGVTdGF0ZS5zb3J0LnByZWRpY2F0ZSkge1xuICAgICAgICBmaWx0ZXJlZCA9IG9yZGVyQnkoZmlsdGVyZWQsIHRhYmxlU3RhdGUuc29ydC5wcmVkaWNhdGUsIHRhYmxlU3RhdGUuc29ydC5yZXZlcnNlKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmaWx0ZXJlZDtcbiAgICB9O1xuXG4gICAgdGhpcy5waXBlUGFnaW5hdGlvbiA9IGZ1bmN0aW9uIHBpcGVQYWdpbmF0aW9uICh0YWJsZVN0YXRlLCBmaWx0ZXJlZCkge1xuICAgICAgdmFyIHBhZ2luYXRpb24gPSB0YWJsZVN0YXRlLnBhZ2luYXRpb247XG4gICAgICB2YXIgb3V0cHV0O1xuICAgICAgaWYgKHBhZ2luYXRpb24ubnVtYmVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcGFnaW5hdGlvbi5udW1iZXJPZlBhZ2VzID0gZmlsdGVyZWQubGVuZ3RoID4gMCA/IE1hdGguY2VpbChmaWx0ZXJlZC5sZW5ndGggLyBwYWdpbmF0aW9uLm51bWJlcikgOiAxO1xuICAgICAgICBwYWdpbmF0aW9uLnN0YXJ0ID0gcGFnaW5hdGlvbi5zdGFydCA+PSBmaWx0ZXJlZC5sZW5ndGggPyAocGFnaW5hdGlvbi5udW1iZXJPZlBhZ2VzIC0gMSkgKiBwYWdpbmF0aW9uLm51bWJlciA6IHBhZ2luYXRpb24uc3RhcnQ7XG4gICAgICAgIG91dHB1dCA9IGZpbHRlcmVkLnNsaWNlKHBhZ2luYXRpb24uc3RhcnQsIHBhZ2luYXRpb24uc3RhcnQgKyBwYXJzZUludChwYWdpbmF0aW9uLm51bWJlcikpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG91dHB1dCB8fCBmaWx0ZXJlZDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogdGhpcyB3aWxsIGNoYWluIHRoZSBvcGVyYXRpb25zIG9mIHNvcnRpbmcgYW5kIGZpbHRlcmluZyBiYXNlZCBvbiB0aGUgY3VycmVudCB0YWJsZSBzdGF0ZSAoc29ydCBvcHRpb25zLCBmaWx0ZXJpbmcsIGVjdClcbiAgICAgKi9cbiAgICB0aGlzLnBpcGUgPSBmdW5jdGlvbiBwaXBlICgpIHtcbiAgICAgIHZhciBwYWdpbmF0aW9uID0gdGFibGVTdGF0ZS5wYWdpbmF0aW9uO1xuICAgICAgZmlsdGVyZWQgPSB0aGlzLnNhZmVDb3B5KCk7XG4gICAgICBpZiAobmcuaXNGdW5jdGlvbih0aGlzLnBpcGVQcmUpKSB7XG4gICAgICAgIGZpbHRlcmVkID0gdGhpcy5waXBlUHJlKHRhYmxlU3RhdGUsIGZpbHRlcmVkKTtcbiAgICAgIH1cbiAgICAgIGZpbHRlcmVkID0gdGhpcy5waXBlU2VhcmNoKHRhYmxlU3RhdGUsIGZpbHRlcmVkKTtcbiAgICAgIGZpbHRlcmVkID0gdGhpcy5waXBlU29ydCh0YWJsZVN0YXRlLCBmaWx0ZXJlZCk7XG4gICAgICBmaWx0ZXJlZCA9IHRoaXMucGlwZVBhZ2luYXRpb24odGFibGVTdGF0ZSwgZmlsdGVyZWQpO1xuICAgICAgaWYgKG5nLmlzRnVuY3Rpb24odGhpcy5waXBlUG9zdCkpIHtcbiAgICAgICAgZmlsdGVyZWQgPSB0aGlzLnBpcGVQb3N0KHRhYmxlU3RhdGUsIGZpbHRlcmVkKTtcbiAgICAgIH1cbiAgICAgIGRpc3BsYXlTZXR0ZXIoJHNjb3BlLCBmaWx0ZXJlZCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIHNlbGVjdCBhIGRhdGFSb3cgKGl0IHdpbGwgYWRkIHRoZSBhdHRyaWJ1dGUgaXNTZWxlY3RlZCB0byB0aGUgcm93IG9iamVjdClcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcm93IC0gdGhlIHJvdyB0byBzZWxlY3RcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gW21vZGVdIC0gXCJzaW5nbGVcIiBvciBcIm11bHRpcGxlXCIgKG11bHRpcGxlIGJ5IGRlZmF1bHQpXG4gICAgICovXG4gICAgdGhpcy5zZWxlY3QgPSBmdW5jdGlvbiBzZWxlY3QgKHJvdywgbW9kZSkge1xuICAgICAgdmFyIHJvd3MgPSBjb3B5UmVmcyhkaXNwbGF5R2V0dGVyKCRzY29wZSkpO1xuICAgICAgdmFyIGluZGV4ID0gcm93cy5pbmRleE9mKHJvdyk7XG4gICAgICBpZiAoaW5kZXggIT09IC0xKSB7XG4gICAgICAgIGlmIChtb2RlID09PSAnc2luZ2xlJykge1xuICAgICAgICAgIHJvdy5pc1NlbGVjdGVkID0gcm93LmlzU2VsZWN0ZWQgIT09IHRydWU7XG4gICAgICAgICAgaWYgKGxhc3RTZWxlY3RlZCkge1xuICAgICAgICAgICAgbGFzdFNlbGVjdGVkLmlzU2VsZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgbGFzdFNlbGVjdGVkID0gcm93LmlzU2VsZWN0ZWQgPT09IHRydWUgPyByb3cgOiB1bmRlZmluZWQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcm93c1tpbmRleF0uaXNTZWxlY3RlZCA9ICFyb3dzW2luZGV4XS5pc1NlbGVjdGVkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIHRha2UgYSBzbGljZSBvZiB0aGUgY3VycmVudCBzb3J0ZWQvZmlsdGVyZWQgY29sbGVjdGlvbiAocGFnaW5hdGlvbilcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzdGFydCAtIHN0YXJ0IGluZGV4IG9mIHRoZSBzbGljZVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBudW1iZXIgLSB0aGUgbnVtYmVyIG9mIGl0ZW0gaW4gdGhlIHNsaWNlXG4gICAgICovXG4gICAgdGhpcy5zbGljZSA9IGZ1bmN0aW9uIHNwbGljZSAoc3RhcnQsIG51bWJlcikge1xuICAgICAgdGFibGVTdGF0ZS5wYWdpbmF0aW9uLnN0YXJ0ID0gc3RhcnQ7XG4gICAgICB0YWJsZVN0YXRlLnBhZ2luYXRpb24ubnVtYmVyID0gbnVtYmVyO1xuICAgICAgcmV0dXJuIHRoaXMucGlwZSgpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiByZXR1cm4gdGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIHRhYmxlXG4gICAgICogQHJldHVybnMge3tzb3J0OiB7fSwgc2VhcmNoOiB7fSwgcGFnaW5hdGlvbjoge3N0YXJ0OiBudW1iZXJ9fX1cbiAgICAgKi9cbiAgICB0aGlzLnRhYmxlU3RhdGUgPSBmdW5jdGlvbiBnZXRUYWJsZVN0YXRlICgpIHtcbiAgICAgIHJldHVybiB0YWJsZVN0YXRlO1xuICAgIH07XG5cbiAgICB0aGlzLnNhZmVDb3B5ID0gZnVuY3Rpb24gZ2V0U2FmZUNvcHkgKCkge1xuICAgICAgcmV0dXJuIHNhZmVDb3B5O1xuICAgIH07XG5cbiAgICB0aGlzLmdldEZpbHRlcmVkQ29sbGVjdGlvbiA9IGZ1bmN0aW9uIGdldEZpbHRlcmVkQ29sbGVjdGlvbiAoKSB7XG4gICAgICByZXR1cm4gZmlsdGVyZWQgfHwgc2FmZUNvcHk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFVzZSBhIGRpZmZlcmVudCBmaWx0ZXIgZnVuY3Rpb24gdGhhbiB0aGUgYW5ndWxhciBGaWx0ZXJGaWx0ZXJcbiAgICAgKiBAcGFyYW0gZmlsdGVyTmFtZSB0aGUgbmFtZSB1bmRlciB3aGljaCB0aGUgY3VzdG9tIGZpbHRlciBpcyByZWdpc3RlcmVkXG4gICAgICovXG4gICAgdGhpcy5zZXRGaWx0ZXJGdW5jdGlvbiA9IGZ1bmN0aW9uIHNldEZpbHRlckZ1bmN0aW9uIChmaWx0ZXJOYW1lKSB7XG4gICAgICBmaWx0ZXIgPSAkZmlsdGVyKGZpbHRlck5hbWUpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBVc2UgYSBkaWZmZXJlbnQgZnVuY3Rpb24gdGhhbiB0aGUgYW5ndWxhciBvcmRlckJ5XG4gICAgICogQHBhcmFtIHNvcnRGdW5jdGlvbk5hbWUgdGhlIG5hbWUgdW5kZXIgd2hpY2ggdGhlIGN1c3RvbSBvcmRlciBmdW5jdGlvbiBpcyByZWdpc3RlcmVkXG4gICAgICovXG4gICAgdGhpcy5zZXRTb3J0RnVuY3Rpb24gPSBmdW5jdGlvbiBzZXRTb3J0RnVuY3Rpb24gKHNvcnRGdW5jdGlvbk5hbWUpIHtcbiAgICAgIG9yZGVyQnkgPSAkZmlsdGVyKHNvcnRGdW5jdGlvbk5hbWUpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBVc3VhbGx5IHdoZW4gdGhlIHNhZmUgY29weSBpcyB1cGRhdGVkIHRoZSBwaXBlIGZ1bmN0aW9uIGlzIGNhbGxlZC5cbiAgICAgKiBDYWxsaW5nIHRoaXMgbWV0aG9kIHdpbGwgcHJldmVudCBpdCwgd2hpY2ggaXMgc29tZXRoaW5nIHJlcXVpcmVkIHdoZW4gdXNpbmcgYSBjdXN0b20gcGlwZSBmdW5jdGlvblxuICAgICAqL1xuICAgIHRoaXMucHJldmVudFBpcGVPbldhdGNoID0gZnVuY3Rpb24gcHJldmVudFBpcGUgKCkge1xuICAgICAgcGlwZUFmdGVyU2FmZUNvcHkgPSBmYWxzZTtcbiAgICB9O1xuICB9XSlcbiAgLmRpcmVjdGl2ZSgnc3RUYWJsZScsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVzdHJpY3Q6ICdBJyxcbiAgICAgIGNvbnRyb2xsZXI6ICdzdFRhYmxlQ29udHJvbGxlcicsXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcblxuICAgICAgICBpZiAoYXR0ci5zdFNldEZpbHRlcikge1xuICAgICAgICAgIGN0cmwuc2V0RmlsdGVyRnVuY3Rpb24oYXR0ci5zdFNldEZpbHRlcik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYXR0ci5zdFNldFNvcnQpIHtcbiAgICAgICAgICBjdHJsLnNldFNvcnRGdW5jdGlvbihhdHRyLnN0U2V0U29ydCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuICB9KTtcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxuICAuZGlyZWN0aXZlKCdzdFNlYXJjaCcsIFsnc3RDb25maWcnLCAnJHRpbWVvdXQnLCckcGFyc2UnLCBmdW5jdGlvbiAoc3RDb25maWcsICR0aW1lb3V0LCAkcGFyc2UpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcbiAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0ciwgY3RybCkge1xuICAgICAgICB2YXIgdGFibGVDdHJsID0gY3RybDtcbiAgICAgICAgdmFyIHByb21pc2UgPSBudWxsO1xuICAgICAgICB2YXIgdGhyb3R0bGUgPSBhdHRyLnN0RGVsYXkgfHwgc3RDb25maWcuc2VhcmNoLmRlbGF5O1xuICAgICAgICB2YXIgZXZlbnQgPSBhdHRyLnN0SW5wdXRFdmVudCB8fCBzdENvbmZpZy5zZWFyY2guaW5wdXRFdmVudDtcblxuICAgICAgICBhdHRyLiRvYnNlcnZlKCdzdFNlYXJjaCcsIGZ1bmN0aW9uIChuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcbiAgICAgICAgICB2YXIgaW5wdXQgPSBlbGVtZW50WzBdLnZhbHVlO1xuICAgICAgICAgIGlmIChuZXdWYWx1ZSAhPT0gb2xkVmFsdWUgJiYgaW5wdXQpIHtcbiAgICAgICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLnNlYXJjaCA9IHt9O1xuICAgICAgICAgICAgdGFibGVDdHJsLnNlYXJjaChpbnB1dCwgbmV3VmFsdWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy90YWJsZSBzdGF0ZSAtPiB2aWV3XG4gICAgICAgIHNjb3BlLiR3YXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGN0cmwudGFibGVTdGF0ZSgpLnNlYXJjaDtcbiAgICAgICAgfSwgZnVuY3Rpb24gKG5ld1ZhbHVlLCBvbGRWYWx1ZSkge1xuICAgICAgICAgIHZhciBwcmVkaWNhdGVFeHByZXNzaW9uID0gYXR0ci5zdFNlYXJjaCB8fCAnJCc7XG4gICAgICAgICAgaWYgKG5ld1ZhbHVlLnByZWRpY2F0ZU9iamVjdCAmJiAkcGFyc2UocHJlZGljYXRlRXhwcmVzc2lvbikobmV3VmFsdWUucHJlZGljYXRlT2JqZWN0KSAhPT0gZWxlbWVudFswXS52YWx1ZSkge1xuICAgICAgICAgICAgZWxlbWVudFswXS52YWx1ZSA9ICRwYXJzZShwcmVkaWNhdGVFeHByZXNzaW9uKShuZXdWYWx1ZS5wcmVkaWNhdGVPYmplY3QpIHx8ICcnO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgLy8gdmlldyAtPiB0YWJsZSBzdGF0ZVxuICAgICAgICBlbGVtZW50LmJpbmQoZXZlbnQsIGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgICBldnQgPSBldnQub3JpZ2luYWxFdmVudCB8fCBldnQ7XG4gICAgICAgICAgaWYgKHByb21pc2UgIT09IG51bGwpIHtcbiAgICAgICAgICAgICR0aW1lb3V0LmNhbmNlbChwcm9taXNlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBwcm9taXNlID0gJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGFibGVDdHJsLnNlYXJjaChldnQudGFyZ2V0LnZhbHVlLCBhdHRyLnN0U2VhcmNoIHx8ICcnKTtcbiAgICAgICAgICAgIHByb21pc2UgPSBudWxsO1xuICAgICAgICAgIH0sIHRocm90dGxlKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXG4gIC5kaXJlY3RpdmUoJ3N0U2VsZWN0Um93JywgWydzdENvbmZpZycsIGZ1bmN0aW9uIChzdENvbmZpZykge1xuICAgIHJldHVybiB7XG4gICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcbiAgICAgIHNjb3BlOiB7XG4gICAgICAgIHJvdzogJz1zdFNlbGVjdFJvdydcbiAgICAgIH0sXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcbiAgICAgICAgdmFyIG1vZGUgPSBhdHRyLnN0U2VsZWN0TW9kZSB8fCBzdENvbmZpZy5zZWxlY3QubW9kZTtcbiAgICAgICAgZWxlbWVudC5iaW5kKCdjbGljaycsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgY3RybC5zZWxlY3Qoc2NvcGUucm93LCBtb2RlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoKCdyb3cuaXNTZWxlY3RlZCcsIGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgIGlmIChuZXdWYWx1ZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgZWxlbWVudC5hZGRDbGFzcyhzdENvbmZpZy5zZWxlY3Quc2VsZWN0ZWRDbGFzcyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQ2xhc3Moc3RDb25maWcuc2VsZWN0LnNlbGVjdGVkQ2xhc3MpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXG4gIC5kaXJlY3RpdmUoJ3N0U29ydCcsIFsnc3RDb25maWcnLCAnJHBhcnNlJywgZnVuY3Rpb24gKHN0Q29uZmlnLCAkcGFyc2UpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVzdHJpY3Q6ICdBJyxcbiAgICAgIHJlcXVpcmU6ICdec3RUYWJsZScsXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcblxuICAgICAgICB2YXIgcHJlZGljYXRlID0gYXR0ci5zdFNvcnQ7XG4gICAgICAgIHZhciBnZXR0ZXIgPSAkcGFyc2UocHJlZGljYXRlKTtcbiAgICAgICAgdmFyIGluZGV4ID0gMDtcbiAgICAgICAgdmFyIGNsYXNzQXNjZW50ID0gYXR0ci5zdENsYXNzQXNjZW50IHx8IHN0Q29uZmlnLnNvcnQuYXNjZW50Q2xhc3M7XG4gICAgICAgIHZhciBjbGFzc0Rlc2NlbnQgPSBhdHRyLnN0Q2xhc3NEZXNjZW50IHx8IHN0Q29uZmlnLnNvcnQuZGVzY2VudENsYXNzO1xuICAgICAgICB2YXIgc3RhdGVDbGFzc2VzID0gW2NsYXNzQXNjZW50LCBjbGFzc0Rlc2NlbnRdO1xuICAgICAgICB2YXIgc29ydERlZmF1bHQ7XG4gICAgICAgIHZhciBza2lwTmF0dXJhbCA9IGF0dHIuc3RTa2lwTmF0dXJhbCAhPT0gdW5kZWZpbmVkID8gYXR0ci5zdFNraXBOYXR1cmFsIDogc3RDb25maWcuc29ydC5za2lwTmF0dXJhbDtcblxuICAgICAgICBpZiAoYXR0ci5zdFNvcnREZWZhdWx0KSB7XG4gICAgICAgICAgc29ydERlZmF1bHQgPSBzY29wZS4kZXZhbChhdHRyLnN0U29ydERlZmF1bHQpICE9PSB1bmRlZmluZWQgPyBzY29wZS4kZXZhbChhdHRyLnN0U29ydERlZmF1bHQpIDogYXR0ci5zdFNvcnREZWZhdWx0O1xuICAgICAgICB9XG5cbiAgICAgICAgLy92aWV3IC0tPiB0YWJsZSBzdGF0ZVxuICAgICAgICBmdW5jdGlvbiBzb3J0ICgpIHtcbiAgICAgICAgICBpbmRleCsrO1xuICAgICAgICAgIHByZWRpY2F0ZSA9IG5nLmlzRnVuY3Rpb24oZ2V0dGVyKHNjb3BlKSkgPyBnZXR0ZXIoc2NvcGUpIDogYXR0ci5zdFNvcnQ7XG4gICAgICAgICAgaWYgKGluZGV4ICUgMyA9PT0gMCAmJiAhIXNraXBOYXR1cmFsICE9PSB0cnVlKSB7XG4gICAgICAgICAgICAvL21hbnVhbCByZXNldFxuICAgICAgICAgICAgaW5kZXggPSAwO1xuICAgICAgICAgICAgY3RybC50YWJsZVN0YXRlKCkuc29ydCA9IHt9O1xuICAgICAgICAgICAgY3RybC50YWJsZVN0YXRlKCkucGFnaW5hdGlvbi5zdGFydCA9IDA7XG4gICAgICAgICAgICBjdHJsLnBpcGUoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY3RybC5zb3J0QnkocHJlZGljYXRlLCBpbmRleCAlIDIgPT09IDApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGVsZW1lbnQuYmluZCgnY2xpY2snLCBmdW5jdGlvbiBzb3J0Q2xpY2sgKCkge1xuICAgICAgICAgIGlmIChwcmVkaWNhdGUpIHtcbiAgICAgICAgICAgIHNjb3BlLiRhcHBseShzb3J0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChzb3J0RGVmYXVsdCkge1xuICAgICAgICAgIGluZGV4ID0gc29ydERlZmF1bHQgPT09ICdyZXZlcnNlJyA/IDEgOiAwO1xuICAgICAgICAgIHNvcnQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vdGFibGUgc3RhdGUgLS0+IHZpZXdcbiAgICAgICAgc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gY3RybC50YWJsZVN0YXRlKCkuc29ydDtcbiAgICAgICAgfSwgZnVuY3Rpb24gKG5ld1ZhbHVlKSB7XG4gICAgICAgICAgaWYgKG5ld1ZhbHVlLnByZWRpY2F0ZSAhPT0gcHJlZGljYXRlKSB7XG4gICAgICAgICAgICBpbmRleCA9IDA7XG4gICAgICAgICAgICBlbGVtZW50XG4gICAgICAgICAgICAgIC5yZW1vdmVDbGFzcyhjbGFzc0FzY2VudClcbiAgICAgICAgICAgICAgLnJlbW92ZUNsYXNzKGNsYXNzRGVzY2VudCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluZGV4ID0gbmV3VmFsdWUucmV2ZXJzZSA9PT0gdHJ1ZSA/IDIgOiAxO1xuICAgICAgICAgICAgZWxlbWVudFxuICAgICAgICAgICAgICAucmVtb3ZlQ2xhc3Moc3RhdGVDbGFzc2VzW2luZGV4ICUgMl0pXG4gICAgICAgICAgICAgIC5hZGRDbGFzcyhzdGF0ZUNsYXNzZXNbaW5kZXggLSAxXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcbiAgLmRpcmVjdGl2ZSgnc3RQYWdpbmF0aW9uJywgWydzdENvbmZpZycsIGZ1bmN0aW9uIChzdENvbmZpZykge1xuICAgIHJldHVybiB7XG4gICAgICByZXN0cmljdDogJ0VBJyxcbiAgICAgIHJlcXVpcmU6ICdec3RUYWJsZScsXG4gICAgICBzY29wZToge1xuICAgICAgICBzdEl0ZW1zQnlQYWdlOiAnPT8nLFxuICAgICAgICBzdERpc3BsYXllZFBhZ2VzOiAnPT8nLFxuICAgICAgICBzdFBhZ2VDaGFuZ2U6ICcmJ1xuICAgICAgfSxcbiAgICAgIHRlbXBsYXRlVXJsOiBmdW5jdGlvbiAoZWxlbWVudCwgYXR0cnMpIHtcbiAgICAgICAgaWYgKGF0dHJzLnN0VGVtcGxhdGUpIHtcbiAgICAgICAgICByZXR1cm4gYXR0cnMuc3RUZW1wbGF0ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RDb25maWcucGFnaW5hdGlvbi50ZW1wbGF0ZTtcbiAgICAgIH0sXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzLCBjdHJsKSB7XG5cbiAgICAgICAgc2NvcGUuc3RJdGVtc0J5UGFnZSA9IHNjb3BlLnN0SXRlbXNCeVBhZ2UgPyArKHNjb3BlLnN0SXRlbXNCeVBhZ2UpIDogc3RDb25maWcucGFnaW5hdGlvbi5pdGVtc0J5UGFnZTtcbiAgICAgICAgc2NvcGUuc3REaXNwbGF5ZWRQYWdlcyA9IHNjb3BlLnN0RGlzcGxheWVkUGFnZXMgPyArKHNjb3BlLnN0RGlzcGxheWVkUGFnZXMpIDogc3RDb25maWcucGFnaW5hdGlvbi5kaXNwbGF5ZWRQYWdlcztcblxuICAgICAgICBzY29wZS5jdXJyZW50UGFnZSA9IDE7XG4gICAgICAgIHNjb3BlLnBhZ2VzID0gW107XG5cbiAgICAgICAgZnVuY3Rpb24gcmVkcmF3ICgpIHtcbiAgICAgICAgICB2YXIgcGFnaW5hdGlvblN0YXRlID0gY3RybC50YWJsZVN0YXRlKCkucGFnaW5hdGlvbjtcbiAgICAgICAgICB2YXIgc3RhcnQgPSAxO1xuICAgICAgICAgIHZhciBlbmQ7XG4gICAgICAgICAgdmFyIGk7XG4gICAgICAgICAgdmFyIHByZXZQYWdlID0gc2NvcGUuY3VycmVudFBhZ2U7XG4gICAgICAgICAgc2NvcGUuY3VycmVudFBhZ2UgPSBNYXRoLmZsb29yKHBhZ2luYXRpb25TdGF0ZS5zdGFydCAvIHBhZ2luYXRpb25TdGF0ZS5udW1iZXIpICsgMTtcblxuICAgICAgICAgIHN0YXJ0ID0gTWF0aC5tYXgoc3RhcnQsIHNjb3BlLmN1cnJlbnRQYWdlIC0gTWF0aC5hYnMoTWF0aC5mbG9vcihzY29wZS5zdERpc3BsYXllZFBhZ2VzIC8gMikpKTtcbiAgICAgICAgICBlbmQgPSBzdGFydCArIHNjb3BlLnN0RGlzcGxheWVkUGFnZXM7XG5cbiAgICAgICAgICBpZiAoZW5kID4gcGFnaW5hdGlvblN0YXRlLm51bWJlck9mUGFnZXMpIHtcbiAgICAgICAgICAgIGVuZCA9IHBhZ2luYXRpb25TdGF0ZS5udW1iZXJPZlBhZ2VzICsgMTtcbiAgICAgICAgICAgIHN0YXJ0ID0gTWF0aC5tYXgoMSwgZW5kIC0gc2NvcGUuc3REaXNwbGF5ZWRQYWdlcyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgc2NvcGUucGFnZXMgPSBbXTtcbiAgICAgICAgICBzY29wZS5udW1QYWdlcyA9IHBhZ2luYXRpb25TdGF0ZS5udW1iZXJPZlBhZ2VzO1xuXG4gICAgICAgICAgZm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgICAgICAgICAgc2NvcGUucGFnZXMucHVzaChpKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocHJldlBhZ2UgIT09IHNjb3BlLmN1cnJlbnRQYWdlKSB7XG4gICAgICAgICAgICBzY29wZS5zdFBhZ2VDaGFuZ2Uoe25ld1BhZ2U6IHNjb3BlLmN1cnJlbnRQYWdlfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy90YWJsZSBzdGF0ZSAtLT4gdmlld1xuICAgICAgICBzY29wZS4kd2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiBjdHJsLnRhYmxlU3RhdGUoKS5wYWdpbmF0aW9uO1xuICAgICAgICB9LCByZWRyYXcsIHRydWUpO1xuXG4gICAgICAgIC8vc2NvcGUgLS0+IHRhYmxlIHN0YXRlICAoLS0+IHZpZXcpXG4gICAgICAgIHNjb3BlLiR3YXRjaCgnc3RJdGVtc0J5UGFnZScsIGZ1bmN0aW9uIChuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcbiAgICAgICAgICBpZiAobmV3VmFsdWUgIT09IG9sZFZhbHVlKSB7XG4gICAgICAgICAgICBzY29wZS5zZWxlY3RQYWdlKDEpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoKCdzdERpc3BsYXllZFBhZ2VzJywgcmVkcmF3KTtcblxuICAgICAgICAvL3ZpZXcgLT4gdGFibGUgc3RhdGVcbiAgICAgICAgc2NvcGUuc2VsZWN0UGFnZSA9IGZ1bmN0aW9uIChwYWdlKSB7XG4gICAgICAgICAgaWYgKHBhZ2UgPiAwICYmIHBhZ2UgPD0gc2NvcGUubnVtUGFnZXMpIHtcbiAgICAgICAgICAgIGN0cmwuc2xpY2UoKHBhZ2UgLSAxKSAqIHNjb3BlLnN0SXRlbXNCeVBhZ2UsIHNjb3BlLnN0SXRlbXNCeVBhZ2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoIWN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb24ubnVtYmVyKSB7XG4gICAgICAgICAgY3RybC5zbGljZSgwLCBzY29wZS5zdEl0ZW1zQnlQYWdlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG4gIH1dKTtcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxuICAuZGlyZWN0aXZlKCdzdFBpcGUnLCBbJ3N0Q29uZmlnJywgJyR0aW1lb3V0JywgZnVuY3Rpb24gKGNvbmZpZywgJHRpbWVvdXQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVxdWlyZTogJ3N0VGFibGUnLFxuICAgICAgc2NvcGU6IHtcbiAgICAgICAgc3RQaXBlOiAnPSdcbiAgICAgIH0sXG4gICAgICBsaW5rOiB7XG5cbiAgICAgICAgcHJlOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzLCBjdHJsKSB7XG5cbiAgICAgICAgICB2YXIgcGlwZVByb21pc2UgPSBudWxsO1xuXG4gICAgICAgICAgaWYgKG5nLmlzRnVuY3Rpb24oc2NvcGUuc3RQaXBlKSkge1xuICAgICAgICAgICAgY3RybC5wcmV2ZW50UGlwZU9uV2F0Y2goKTtcbiAgICAgICAgICAgIGN0cmwucGlwZSA9IGZ1bmN0aW9uICgpIHtcblxuICAgICAgICAgICAgICBpZiAocGlwZVByb21pc2UgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAkdGltZW91dC5jYW5jZWwocGlwZVByb21pc2UpXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBwaXBlUHJvbWlzZSA9ICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzY29wZS5zdFBpcGUoY3RybC50YWJsZVN0YXRlKCksIGN0cmwpO1xuICAgICAgICAgICAgICB9LCBjb25maWcucGlwZS5kZWxheSk7XG5cbiAgICAgICAgICAgICAgcmV0dXJuIHBpcGVQcm9taXNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBwb3N0OiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzLCBjdHJsKSB7XG4gICAgICAgICAgY3RybC5waXBlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG4iLCJ9KShhbmd1bGFyKTsiXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=